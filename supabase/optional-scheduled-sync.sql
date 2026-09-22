-- ===========================================================================
-- OPTIONAL: schedule the AREDL sync from inside Postgres
-- ===========================================================================
-- This is one of two ways to keep AREDL ranks current without anyone opening
-- the site. Pick whichever you prefer - you do not need both:
--
--   A) This file: pg_cron + pg_net, entirely inside Supabase.
--   B) .github/workflows/sync-aredl.yml, a scheduled GitHub Action.
--
-- It is deliberately NOT in migrations/, because it embeds your project ref and
-- a secret and should be run once, by hand, with those filled in.
--
-- Before running:
--   1. Deploy the function:      supabase functions deploy sync-aredl
--   2. Set its secret:           supabase secrets set SYNC_SECRET=<random>
--   3. Enable the extensions in the Supabase dashboard:
--      Database -> Extensions -> enable `pg_cron` and `pg_net`
--   4. Replace <PROJECT_REF> and <SYNC_SECRET> below.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- -------------------------------------------------------------------------
-- Store the secret in Vault rather than inline in the job definition.
-- cron.job is readable by anyone who can read the catalog; Vault is not.
-- -------------------------------------------------------------------------
select vault.create_secret('<SYNC_SECRET>', 'blgd_sync_secret', 'Shared secret for the sync-aredl Edge Function');

-- -------------------------------------------------------------------------
-- The job. Daily at 04:17 UTC - an odd minute so it does not land in the
-- same stampede as every other hourly cron job.
-- -------------------------------------------------------------------------
select cron.schedule(
  'blgd-sync-aredl',
  '17 4 * * *',
  $cron$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-aredl',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-sync-secret', (select decrypted_secret
                          from vault.decrypted_secrets
                          where name = 'blgd_sync_secret')
      ),
      body    := '{}'::jsonb
    );
  $cron$
);

-- -------------------------------------------------------------------------
-- Useful afterwards
-- -------------------------------------------------------------------------
-- List jobs:
--   select jobid, schedule, jobname, active from cron.job;
--
-- See the last few runs (pg_cron's own log - says whether the HTTP call was
-- *issued*, not what the function replied):
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- See what the function actually did (this is the useful one):
--   select created_at, status, levels_seen, levels_updated, message, duration_ms
--   from public.sync_runs
--   where kind = 'sync-aredl'
--   order by created_at desc
--   limit 10;
--
-- Remove the job:
--   select cron.unschedule('blgd-sync-aredl');
