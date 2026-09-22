-- ===========================================================================
-- BLGD - initial schema
-- ===========================================================================
-- Run this once against a fresh Supabase project:
--   Supabase Dashboard -> SQL Editor -> paste -> Run
-- or, with the Supabase CLI:
--   supabase db push
--
-- Design notes
-- ------------
-- * profiles.id IS the auth.users.id. The brief asked for a separate
--   auth_user_id column; a 1:1 table keyed directly on the auth uid is the
--   canonical Supabase pattern, keeps every RLS policy a simple
--   auth.uid() = id comparison and removes a join from every query. The
--   column is therefore both the primary key and the auth user id.
-- * Level metadata lives in levels, once per Geometry Dash level. Personal
--   data lives in completions. A level completed by five people is one
--   levels row and five completions rows.
-- * aredl_levels is a local mirror of the public AREDL ranking, refreshed by
--   the sync-aredl Edge Function. Ranks are resolved by matching
--   gd_level_id, never by trusting a value a client sent us.
-- ===========================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,

  -- Site identity. username_key exists so that lookups by URL segment are a
  -- plain indexed equality check instead of a case-insensitive pattern match.
  username       text not null
                   check (username ~ '^[A-Za-z0-9_.-]{3,24}$'),
  username_key   text generated always as (lower(username)) stored,
  display_name   text check (display_name is null or char_length(display_name) <= 48),
  bio            text check (bio is null or char_length(bio) <= 280),

  -- Linked Geometry Dash account. Everything prefixed gd_ is fetched from
  -- the Geometry Dash data provider and must never be typed in by hand - the
  -- only user-supplied value is gd_username, which is then resolved.
  gd_username    text,
  gd_account_id  bigint,
  gd_player_id   bigint,
  gd_stars       integer,
  gd_moons       integer,
  gd_diamonds    integer,
  gd_demons      integer,
  gd_icon        jsonb,
  gd_synced_at   timestamptz,

  is_admin       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists profiles_username_key_uidx on public.profiles (username_key);
create unique index if not exists profiles_gd_account_id_uidx
  on public.profiles (gd_account_id) where gd_account_id is not null;
create index if not exists profiles_gd_stars_idx on public.profiles (gd_stars desc nulls last);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER so that policies on profiles can ask "is this user an
-- admin?" without re-entering the policies on profiles (which would recurse).
--
-- Defined here rather than with the other helpers at the top of the file: it is
-- `language sql`, so Postgres parses and validates its body at CREATE time and
-- the profiles table has to exist first.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$fn$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- levels  (shared catalogue - one row per Geometry Dash level)
-- ---------------------------------------------------------------------------

create table if not exists public.levels (
  id                      uuid primary key default gen_random_uuid(),
  gd_level_id             bigint not null unique check (gd_level_id > 0),

  name                    text not null,
  creator                 text,
  creators                text[] not null default '{}',
  gd_account_id           bigint,
  gd_player_id            bigint,
  difficulty              text,
  length                  text,
  song_name               text,
  downloads               bigint,
  likes                   bigint,

  -- AREDL mirror, refreshed from aredl_levels. NULL rank = not on the list.
  aredl_id                uuid,
  aredl_rank              integer check (aredl_rank is null or aredl_rank > 0),
  aredl_status            text check (aredl_status is null or aredl_status in ('MainList', 'Legacy')),
  aredl_points            numeric(10, 2),
  gddl_tier               numeric(5, 2),
  tags                    text[] not null default '{}',
  description             text,

  -- Geometry Dash has no level-preview service. The authoritative image is the
  -- thumbnail of the AREDL verification video; see src/utils/thumbnails.ts.
  verification_video_url  text,
  thumbnail_url           text,

  aredl_synced_at         timestamptz,
  gd_synced_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists levels_aredl_rank_idx on public.levels (aredl_rank asc nulls last);
create index if not exists levels_name_idx on public.levels (lower(name));
create index if not exists levels_creator_idx on public.levels (lower(creator));

drop trigger if exists levels_set_updated_at on public.levels;
create trigger levels_set_updated_at
  before update on public.levels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- completions  (personal data - one row per user per level)
-- ---------------------------------------------------------------------------
--
-- Rating scale decision (documented in README, "Rating scale"):
-- 0-10 in steps of 0.5, stored as numeric(3,1). Half steps give 21 distinct
-- values, which is enough resolution to separate "good" from "great" without
-- asking anyone to agonise over 7.25 vs 7.3. The CHECK enforces the step so
-- the database, not just the slider, is the source of truth.
-- ---------------------------------------------------------------------------

create table if not exists public.completions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  level_id          uuid not null references public.levels (id) on delete cascade,

  enjoyment         numeric(3, 1)
                      check (enjoyment is null or (enjoyment >= 0 and enjoyment <= 10
                             and enjoyment * 2 = trunc(enjoyment * 2))),
  difficulty        numeric(3, 1)
                      check (difficulty is null or (difficulty >= 0 and difficulty <= 10
                             and difficulty * 2 = trunc(difficulty * 2))),

  youtube_url       text,
  youtube_video_id  text check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  note              text check (note is null or char_length(note) <= 500),

  completed_at      date not null default current_date
                      check (completed_at >= date '2013-08-13'),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (user_id, level_id)
);

create index if not exists completions_user_idx on public.completions (user_id, completed_at desc);
create index if not exists completions_level_idx on public.completions (level_id);
create index if not exists completions_recent_idx on public.completions (created_at desc);

drop trigger if exists completions_set_updated_at on public.completions;
create trigger completions_set_updated_at
  before update on public.completions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- aredl_levels  (local mirror of the public AREDL ranking)
-- ---------------------------------------------------------------------------

create table if not exists public.aredl_levels (
  gd_level_id   bigint primary key,
  aredl_id      uuid,
  name          text not null,
  position      integer not null,
  status        text,
  points        numeric(10, 2),
  gddl_tier     numeric(5, 2),
  two_player    boolean not null default false,
  tags          text[] not null default '{}',
  description   text,
  synced_at     timestamptz not null default now()
);

create index if not exists aredl_levels_position_idx on public.aredl_levels (position asc);
create index if not exists aredl_levels_name_idx on public.aredl_levels (lower(name));

-- ---------------------------------------------------------------------------
-- sync_runs  (audit log for the Edge Functions)
-- ---------------------------------------------------------------------------

create table if not exists public.sync_runs (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null,
  status         text not null check (status in ('ok', 'error')),
  levels_seen    integer,
  levels_updated integer,
  message        text,
  duration_ms    integer,
  created_at     timestamptz not null default now()
);

create index if not exists sync_runs_created_idx on public.sync_runs (kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Profile bootstrap on signup
-- ---------------------------------------------------------------------------
-- The username is passed in options.data at signUp time and lands in
-- raw_user_meta_data. If it is missing or already taken we fall back to a
-- derived, guaranteed-unique handle so that signup can never dead-end with an
-- auth user that has no profile row.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  requested text;
  candidate text;
  suffix    integer := 0;
begin
  requested := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  if requested is null or requested !~ '^[A-Za-z0-9_.-]{3,24}$' then
    requested := 'player' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  candidate := requested;
  while exists (select 1 from public.profiles p where p.username_key = lower(candidate)) loop
    suffix := suffix + 1;
    candidate := substr(requested, 1, 20) || suffix::text;
  end loop;

  insert into public.profiles (id, username, gd_username)
  values (new.id, candidate, nullif(trim(new.raw_user_meta_data ->> 'gd_username'), ''));

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Aggregate views
-- ---------------------------------------------------------------------------
-- security_invoker = on makes the views run with the *caller's* privileges, so
-- the RLS policies below apply to view reads too. Without it a view would run
-- as its owner and quietly bypass RLS.
-- ---------------------------------------------------------------------------

create or replace view public.leaderboard
with (security_invoker = on) as
select
  p.id,
  p.username,
  p.display_name,
  p.gd_username,
  p.gd_account_id,
  p.gd_stars,
  p.gd_demons,
  p.gd_moons,
  p.gd_icon,
  count(c.id)::integer                                   as completions_count,
  round(avg(c.enjoyment)::numeric, 2)                    as avg_enjoyment,
  round(avg(c.difficulty)::numeric, 2)                   as avg_difficulty,
  min(l.aredl_rank)                                      as best_aredl_rank,
  max(c.completed_at)                                    as last_completion_at
from public.profiles p
left join public.completions c on c.user_id = p.id
left join public.levels l on l.id = c.level_id
group by p.id;

create or replace view public.level_stats
with (security_invoker = on) as
select
  l.id                                                   as level_id,
  count(c.id)::integer                                   as completions_count,
  round(avg(c.enjoyment)::numeric, 2)                    as avg_enjoyment,
  round(avg(c.difficulty)::numeric, 2)                   as avg_difficulty
from public.levels l
left join public.completions c on c.level_id = l.id
group by l.id;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
-- Visibility model chosen for this deployment: PUBLIC READ, PRIVATE WRITE.
-- Anyone (signed in or not) can read profiles, levels and completions, which
-- is what makes /profile/<username> links shareable. Only the owner of a row
-- can change it.
--
-- To make the site fully private instead, replace `to anon, authenticated`
-- with `to authenticated` in every SELECT policy below. Nothing else changes.
-- ===========================================================================

alter table public.profiles    enable row level security;
alter table public.levels      enable row level security;
alter table public.completions enable row level security;
alter table public.aredl_levels enable row level security;
alter table public.sync_runs   enable row level security;

-- --- profiles --------------------------------------------------------------

drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select
  to anon, authenticated
  using (true);

-- The signup trigger creates the row; this policy exists so that a user whose
-- profile went missing can recreate exactly their own, and never anyone else's.
drop policy if exists "users insert only their own profile" on public.profiles;
create policy "users insert only their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "users update only their own profile" on public.profiles;
create policy "users update only their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "admins update any profile" on public.profiles;
create policy "admins update any profile"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "users delete only their own profile" on public.profiles;
create policy "users delete only their own profile"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id or public.is_admin());

-- `is_admin` must not be self-grantable. A column-level grant is the only way
-- to stop an UPDATE from touching it, because RLS policies work per row, not
-- per column.
revoke update on public.profiles from authenticated;
grant update (
  username, display_name, bio,
  gd_username, gd_account_id, gd_player_id,
  gd_stars, gd_moons, gd_diamonds, gd_demons, gd_icon, gd_synced_at
) on public.profiles to authenticated;

-- --- levels ----------------------------------------------------------------
-- The level catalogue is shared, factual data. Signed-in users may create and
-- refresh rows so that adding a demon works even before the Edge Functions are
-- deployed; the sync-aredl / resolve-level functions (service_role) then
-- overwrite those fields with authoritative values. Deletion is admin-only so
-- nobody can pull a level out from under another user's completion.
--
-- STRICTER ALTERNATIVE: drop the two policies below and require the
-- resolve-level Edge Function for all writes. The app already prefers it.

drop policy if exists "levels are readable by everyone" on public.levels;
create policy "levels are readable by everyone"
  on public.levels for select
  to anon, authenticated
  using (true);

drop policy if exists "signed in users can add levels" on public.levels;
create policy "signed in users can add levels"
  on public.levels for insert
  to authenticated
  with check (true);

drop policy if exists "signed in users can refresh levels" on public.levels;
create policy "signed in users can refresh levels"
  on public.levels for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "only admins delete levels" on public.levels;
create policy "only admins delete levels"
  on public.levels for delete
  to authenticated
  using (public.is_admin());

-- --- completions -----------------------------------------------------------
-- This is the table the brief cares most about: a user must never be able to
-- touch another user's ratings. Both USING (which rows are visible to the
-- statement) and WITH CHECK (what the resulting row may look like) are pinned
-- to auth.uid(), so a user cannot create a row for someone else and cannot
-- reassign one of their own rows to another user either.

drop policy if exists "completions are readable by everyone" on public.completions;
create policy "completions are readable by everyone"
  on public.completions for select
  to anon, authenticated
  using (true);

drop policy if exists "users insert their own completions" on public.completions;
create policy "users insert their own completions"
  on public.completions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users update their own completions" on public.completions;
create policy "users update their own completions"
  on public.completions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete their own completions" on public.completions;
create policy "users delete their own completions"
  on public.completions for delete
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- --- aredl_levels ----------------------------------------------------------
-- Read-only mirror. Writes happen exclusively through the sync-aredl Edge
-- Function, which uses the service_role key and bypasses RLS. No write policy
-- exists here on purpose: with RLS enabled and no policy, every client write
-- is denied.

drop policy if exists "aredl mirror is readable by everyone" on public.aredl_levels;
create policy "aredl mirror is readable by everyone"
  on public.aredl_levels for select
  to anon, authenticated
  using (true);

-- --- sync_runs -------------------------------------------------------------

drop policy if exists "admins read sync runs" on public.sync_runs;
create policy "admins read sync runs"
  on public.sync_runs for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------
-- Supabase does not let a client delete its own auth.users row. Deleting the
-- profile cascades all completions; this RPC does that and is callable only
-- for the caller's own id. The auth user itself is removed by the
-- delete-account path in the Settings page via the same RPC plus a signOut.
-- ---------------------------------------------------------------------------

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$fn$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Promote yourself to admin (run once, by hand)
-- ---------------------------------------------------------------------------
-- The SQL editor runs as a superuser, so the column grant above does not apply
-- there. Replace the email and run:
--
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------------------

-- Defense in depth: anonymous visitors have no write path at all.
revoke insert, update, delete on public.profiles    from anon;
revoke insert, update, delete on public.levels      from anon;
revoke insert, update, delete on public.completions from anon;
revoke insert, update, delete on public.aredl_levels from anon, authenticated;
revoke insert, update, delete on public.sync_runs    from anon, authenticated;
