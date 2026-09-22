-- ===========================================================================
-- BLGD - AREDL two-player variants
-- ===========================================================================
-- Run this after 20260922000000_initial_schema.sql.
--
-- Why
-- ---
-- The first migration made `aredl_levels.gd_level_id` the primary key, on the
-- assumption that a Geometry Dash level appears once on the AREDL list. It does
-- not. 18 of the ~1,621 entries are the same Geometry Dash level listed twice:
-- once as "(Solo)" and once as "(2P)", at very different positions, because
-- beating a two-player level alone is far harder.
--
--   GD 62556400  ->  #78   Codependence (Solo)    two_player = false
--   GD 62556400  ->  #1035 Codependence (2P)      two_player = true
--
-- So a batched upsert keyed on gd_level_id fails outright:
--   21000: ON CONFLICT DO UPDATE command cannot affect row a second time
--
-- Fix
-- ---
-- Key the mirror on AREDL's own uuid, which is its real primary key, and index
-- gd_level_id instead. Both variants are then kept, the /aredl page lists them
-- separately (which is correct - they are two different achievements), and the
-- app picks the canonical one when it needs a single rank for a level.
--
-- The mirror is derived data, refreshed by `sync-aredl` from scratch, so
-- recreating the table loses nothing.
-- ===========================================================================

drop table if exists public.aredl_levels;

create table public.aredl_levels (
  -- AREDL's own identifier for a list entry. Two entries can share a
  -- gd_level_id; they never share this.
  aredl_id      uuid primary key,

  gd_level_id   bigint not null check (gd_level_id > 0),
  name          text not null,
  position      integer not null check (position > 0),
  status        text,
  points        numeric(10, 2),
  gddl_tier     numeric(5, 2),

  -- True for the "(2P)" variant of a level that is also listed solo.
  two_player    boolean not null default false,

  tags          text[] not null default '{}',
  description   text,
  synced_at     timestamptz not null default now()
);

create index aredl_levels_gd_level_id_idx on public.aredl_levels (gd_level_id);
create index aredl_levels_position_idx    on public.aredl_levels (position asc);
create index aredl_levels_name_idx        on public.aredl_levels (lower(name));

-- Read-only mirror, exactly as before: RLS on, a SELECT policy for everyone,
-- and no write policy at all, so the only thing that can write it is the
-- service_role key inside the sync-aredl Edge Function.
alter table public.aredl_levels enable row level security;

drop policy if exists "aredl mirror is readable by everyone" on public.aredl_levels;
create policy "aredl mirror is readable by everyone"
  on public.aredl_levels for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.aredl_levels from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Canonical rank per Geometry Dash level
-- ---------------------------------------------------------------------------
-- When the app needs one rank for one level - the badge on a card, the number
-- stamped onto `levels.aredl_rank` - it takes the solo listing, because that is
-- the harder achievement and the one someone logging "I beat this" almost
-- always means. The 2P entry stays in the mirror and is visible on /aredl.
--
-- `distinct on` with this ordering picks two_player = false first, then the
-- better (lower) position as a tie-break.
-- ---------------------------------------------------------------------------

create or replace view public.aredl_canonical
with (security_invoker = on) as
select distinct on (gd_level_id)
  gd_level_id,
  aredl_id,
  name,
  position,
  status,
  points,
  gddl_tier,
  two_player,
  tags,
  description,
  synced_at
from public.aredl_levels
order by gd_level_id, two_player asc, position asc;
