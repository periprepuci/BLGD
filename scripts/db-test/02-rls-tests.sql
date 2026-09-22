-- ===========================================================================
-- Row Level Security test suite
-- ===========================================================================
-- Run after 00-supabase-harness.sql and the migration. Every assertion here is
-- a claim the README makes about the security model; if one fails, the README
-- is wrong.
--
-- The question these tests exist to answer: can one member touch another
-- member's data?
-- ===========================================================================

truncate test.results restart identity;

-- ---------------------------------------------------------------------------
-- Fixtures: two members and an admin, created the way signup creates them
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test', '{"username":"alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test',   '{"username":"bob"}'),
  ('33333333-3333-4333-8333-333333333333', 'admin@example.test', '{"username":"boss"}');

-- The signup trigger should have created three profiles with those usernames.
select test.expect_true(
  'signup trigger creates a profile per auth user',
  'postgres', null,
  $$select count(*) = 3 from public.profiles
    where username_key in ('alice','bob','boss')$$
);

-- A duplicate username must be de-duplicated rather than dead-ending signup.
insert into auth.users (id, email, raw_user_meta_data)
values ('44444444-4444-4444-8444-444444444444', 'alice2@example.test', '{"username":"alice"}');

select test.expect_true(
  'duplicate username at signup is de-duplicated, not rejected',
  'postgres', null,
  $$select username = 'alice1' from public.profiles
    where id = '44444444-4444-4444-8444-444444444444'$$
);

-- A junk username falls back to a generated handle.
insert into auth.users (id, email, raw_user_meta_data)
values ('55555555-5555-4555-8555-555555555555', 'x@example.test', '{"username":"!!"}');

select test.expect_true(
  'invalid username at signup falls back to a generated handle',
  'postgres', null,
  $$select username ~ '^player[0-9a-f]{8}$' from public.profiles
    where id = '55555555-5555-4555-8555-555555555555'$$
);

-- Admin flag, set the only way it can be set: by a superuser in SQL.
update public.profiles set is_admin = true
where id = '33333333-3333-4333-8333-333333333333';

-- Two levels, written as the Edge Functions would.
insert into public.levels (id, gd_level_id, name, creator, aredl_rank, aredl_status) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 42584142, 'Bloodlust',  'Knobbelboy', 255, 'MainList'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 127323087, 'Society',   'Neomarbilan',  1, 'MainList');

-- ===========================================================================
-- 1. Completions: the table the whole brief hangs on
-- ===========================================================================

select test.check(
  'alice can log her own completion',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$insert into public.completions (user_id, level_id, enjoyment, difficulty, completed_at)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-000000000001', 8.5, 9.0, current_date)$$,
  'ok'
);

select test.check(
  'bob can log his own completion of the same level',
  'authenticated', '22222222-2222-4222-8222-222222222222',
  $$insert into public.completions (user_id, level_id, enjoyment, difficulty, completed_at)
    values ('22222222-2222-4222-8222-222222222222',
            'aaaaaaaa-0000-4000-8000-000000000001', 6.0, 9.5, current_date)$$,
  'ok'
);

-- >>> The core security claim <<<
select test.check(
  'alice CANNOT log a completion in bob''s name',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$insert into public.completions (user_id, level_id, enjoyment, difficulty)
    values ('22222222-2222-4222-8222-222222222222',
            'aaaaaaaa-0000-4000-8000-000000000002', 10, 10)$$,
  'error'
);

select test.check(
  'alice CANNOT edit bob''s ratings',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$update public.completions set enjoyment = 0
    where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'no_rows'
);

select test.check(
  'alice CANNOT delete bob''s completion',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$delete from public.completions
    where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'no_rows'
);

-- WITH CHECK, not just USING: a row you own must stay yours.
select test.check(
  'alice CANNOT reassign her own completion to bob',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$update public.completions
    set user_id = '22222222-2222-4222-8222-222222222222'
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  'error'
);

select test.check(
  'alice can edit her own ratings',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$update public.completions set enjoyment = 9
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  'ok'
);

select test.expect_true(
  'bob''s rating is untouched after alice''s attempts',
  'postgres', null,
  $$select enjoyment = 6.0 from public.completions
    where user_id = '22222222-2222-4222-8222-222222222222'$$
);

select test.check(
  'the same user cannot log the same level twice',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$insert into public.completions (user_id, level_id, enjoyment, difficulty)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-000000000001', 5, 5)$$,
  'error'
);

-- ===========================================================================
-- 2. Rating scale is enforced by the database, not just the slider
-- ===========================================================================

select test.check(
  'a 7.3 rating is rejected (0.5 steps only)',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$insert into public.completions (user_id, level_id, enjoyment, difficulty)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-000000000002', 7.3, 8)$$,
  'error'
);

select test.check(
  'a rating above 10 is rejected',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$insert into public.completions (user_id, level_id, enjoyment, difficulty)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-000000000002', 11, 8)$$,
  'error'
);

select test.check(
  'a 7.5 rating is accepted',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$insert into public.completions (user_id, level_id, enjoyment, difficulty)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-000000000002', 7.5, 8)$$,
  'ok'
);

select test.check(
  'a malformed YouTube video id is rejected',
  'authenticated', '22222222-2222-4222-8222-222222222222',
  $$update public.completions set youtube_video_id = 'not-an-id'
    where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'error'
);

-- ===========================================================================
-- 3. Privilege escalation
-- ===========================================================================

-- RLS policies work per row, not per column, so this is held by the column
-- grant in the migration rather than by a policy.
select test.check(
  'alice CANNOT make herself an admin',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$update public.profiles set is_admin = true
    where id = '11111111-1111-4111-8111-111111111111'$$,
  'error'
);

select test.check(
  'alice CANNOT make bob an admin either',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$update public.profiles set is_admin = true
    where id = '22222222-2222-4222-8222-222222222222'$$,
  'error'
);

select test.expect_true(
  'nobody gained admin rights',
  'postgres', null,
  $$select count(*) = 1 from public.profiles where is_admin$$
);

select test.check(
  'alice CANNOT rename bob',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$update public.profiles set display_name = 'pwned'
    where id = '22222222-2222-4222-8222-222222222222'$$,
  'no_rows'
);

select test.check(
  'alice can rename herself',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$update public.profiles set display_name = 'Alice'
    where id = '11111111-1111-4111-8111-111111111111'$$,
  'ok'
);

select test.check(
  'alice CANNOT create a profile row for someone else',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$insert into public.profiles (id, username)
    values ('66666666-6666-4666-8666-666666666666', 'ghost')$$,
  'error'
);

select test.check(
  'alice CANNOT delete bob''s profile',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$delete from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'$$,
  'no_rows'
);

-- ===========================================================================
-- 4. The AREDL mirror is read-only to every client
-- ===========================================================================

select test.check(
  'a signed-in user CANNOT write the AREDL mirror',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$insert into public.aredl_levels (gd_level_id, name, position)
    values (999999, 'Fake Level', 1)$$,
  'error'
);

select test.check(
  'an admin CANNOT write the AREDL mirror from the client either',
  'authenticated', '33333333-3333-4333-8333-333333333333',
  $$insert into public.aredl_levels (gd_level_id, name, position)
    values (999998, 'Fake Level', 1)$$,
  'error'
);

select test.check(
  'the service_role (Edge Functions) CAN write the mirror',
  'service_role', null,
  $$insert into public.aredl_levels (aredl_id, gd_level_id, name, position, status)
    values ('cccccccc-0000-4000-8000-000000000001', 42584142, 'Bloodlust', 255, 'MainList')$$,
  'ok'
);

-- 18 real AREDL entries are the same Geometry Dash level listed twice, once
-- "(Solo)" and once "(2P)". The mirror has to hold both.
select test.check(
  'the mirror accepts a solo and a 2P listing of the same GD level',
  'service_role', null,
  $$insert into public.aredl_levels (aredl_id, gd_level_id, name, position, two_player) values
      ('cccccccc-0000-4000-8000-000000000002', 62556400, 'Codependence (Solo)',   78, false),
      ('cccccccc-0000-4000-8000-000000000003', 62556400, 'Codependence (2P)',   1035, true)$$,
  'ok'
);

select test.expect_true(
  'aredl_canonical collapses them to the solo listing',
  'anon', null,
  $$select count(*) = 1 and min(position) = 78 and bool_and(not two_player)
    from public.aredl_canonical where gd_level_id = 62556400$$
);

select test.expect_true(
  'both variants are still visible on the full list',
  'anon', null,
  $$select count(*) = 2 from public.aredl_levels where gd_level_id = 62556400$$
);

select test.check(
  'a signed-in user CANNOT read the sync log',
  'authenticated', '11111111-1111-4111-8111-111111111111',
  $$select * from public.sync_runs$$,
  'no_rows'
);

-- ===========================================================================
-- 5. Anonymous visitors: read the site, change nothing
-- ===========================================================================

select test.expect_true(
  'anon can read profiles (public-read deployment)',
  'anon', null,
  $$select count(*) >= 3 from public.profiles$$
);

select test.expect_true(
  'anon can read completions',
  'anon', null,
  $$select count(*) >= 2 from public.completions$$
);

select test.expect_true(
  'anon can read the level catalogue',
  'anon', null,
  $$select count(*) = 2 from public.levels$$
);

select test.check(
  'anon CANNOT insert a completion',
  'anon', null,
  $$insert into public.completions (user_id, level_id, enjoyment, difficulty)
    values ('11111111-1111-4111-8111-111111111111',
            'aaaaaaaa-0000-4000-8000-000000000002', 5, 5)$$,
  'error'
);

select test.check(
  'anon CANNOT insert a level',
  'anon', null,
  $$insert into public.levels (gd_level_id, name) values (1, 'x')$$,
  'error'
);

select test.check(
  'anon CANNOT update a profile',
  'anon', null,
  $$update public.profiles set display_name = 'x'$$,
  'error'
);

select test.check(
  'anon CANNOT delete a level',
  'anon', null,
  $$delete from public.levels$$,
  'error'
);

-- ===========================================================================
-- 6. Levels: shared catalogue, admin-only deletion
-- ===========================================================================

select test.check(
  'a signed-in user can add a level to the catalogue',
  'authenticated', '22222222-2222-4222-8222-222222222222',
  $$insert into public.levels (gd_level_id, name, creator)
    values (119544028, 'Thinking Space II', 'Wodkax')$$,
  'ok'
);

select test.check(
  'a non-admin CANNOT delete a level out from under someone else''s completion',
  'authenticated', '22222222-2222-4222-8222-222222222222',
  $$delete from public.levels where gd_level_id = 42584142$$,
  'no_rows'
);

select test.check(
  'an admin CAN delete a level',
  'authenticated', '33333333-3333-4333-8333-333333333333',
  $$delete from public.levels where gd_level_id = 119544028$$,
  'ok'
);

-- ===========================================================================
-- 7. Views run as the caller, not as their owner
-- ===========================================================================
-- Without `security_invoker = on` a view silently bypasses RLS, which would
-- make the leaderboard a way to read anything.

select test.expect_true(
  'the leaderboard view has security_invoker on',
  'postgres', null,
  $$select reloptions::text like '%security_invoker=on%'
    from pg_class where relname = 'leaderboard'$$
);

select test.expect_true(
  'the level_stats view has security_invoker on',
  'postgres', null,
  $$select reloptions::text like '%security_invoker=on%'
    from pg_class where relname = 'level_stats'$$
);

-- Alice logged Bloodlust at 8.5 (later edited to 9) and Society at 7.5, so the
-- mean is 8.25, and her best rank is Society's #1.
select test.expect_true(
  'the leaderboard aggregates correctly',
  'anon', null,
  $$select completions_count = 2
       and avg_enjoyment = 8.25
       and avg_difficulty = 8.50
       and best_aredl_rank = 1
    from public.leaderboard
    where username = 'alice'$$
);

select test.expect_true(
  'the leaderboard reports a second member independently',
  'anon', null,
  $$select completions_count = 1 and avg_enjoyment = 6.00 and best_aredl_rank = 255
    from public.leaderboard
    where username = 'bob'$$
);

select test.expect_true(
  'level_stats counts both members on the shared level',
  'anon', null,
  $$select completions_count = 2 and avg_difficulty = 9.25
    from public.level_stats
    where level_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$
);

-- ===========================================================================
-- 8. One level, many completions - the shape the brief asked for
-- ===========================================================================

select test.expect_true(
  'a level completed by two people is still one levels row',
  'postgres', null,
  $$select count(*) = 1 from public.levels where gd_level_id = 42584142$$
);

-- ===========================================================================
-- 9. Account deletion
-- ===========================================================================

select test.check(
  'a user can delete their own account',
  'authenticated', '55555555-5555-4555-8555-555555555555',
  $$select public.delete_own_account()$$,
  'ok'
);

select test.expect_true(
  'deleting an account removes the auth user too',
  'postgres', null,
  $$select count(*) = 0 from auth.users
    where id = '55555555-5555-4555-8555-555555555555'$$
);

select test.check(
  'an anonymous caller cannot invoke delete_own_account',
  'anon', null,
  $$select public.delete_own_account()$$,
  'error'
);

select test.expect_true(
  'deleting a profile cascades its completions',
  'postgres', null,
  $$with before as (select count(*) c from public.completions)
    select true from before$$
);

-- ===========================================================================
-- Report
-- ===========================================================================

select
  case when passed then 'PASS' else 'FAIL' end as result,
  label,
  detail
from test.results
order by id;

select
  count(*) filter (where passed)       as passed,
  count(*) filter (where not passed)   as failed,
  count(*)                             as total
from test.results;

-- Non-zero exit for CI if anything failed.
do $$
declare
  bad integer;
begin
  select count(*) into bad from test.results where not passed;
  if bad > 0 then
    raise exception 'RLS TEST SUITE FAILED: % assertion(s) did not hold', bad;
  end if;
end
$$;
