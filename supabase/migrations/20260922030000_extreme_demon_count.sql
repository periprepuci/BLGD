-- ===========================================================================
-- BLGD - how many Extreme Demons you have actually beaten
-- ===========================================================================
-- Run after the three earlier migrations.
--
-- Until now the only Extreme Demon count the site knew was "how many you have
-- logged here", which says nothing about how many you have beaten in the game.
-- Geometry Dash tracks that number, and the provider exposes it broken down by
-- difficulty, so the two can be compared and the gap shown.
--
--   GDBrowser /api/profile/:user
--     "demons": 622                        <- every demon, all difficulties
--     "classicDemonsCompleted": {
--        "easy": 299, ..., "extreme": 28   <- this is the one that matters
--     }
--     "platformerDemonsCompleted": { ..., "extreme": 0 }
--
-- Only the **classic** count is stored. AREDL is a classic-mode list, so a
-- platformer extreme demon could never appear on it and counting it would make
-- the gap permanently wrong.
-- ===========================================================================

alter table public.profiles
  add column if not exists gd_extreme_demons integer
    check (gd_extreme_demons is null or gd_extreme_demons >= 0);

comment on column public.profiles.gd_extreme_demons is
  'Classic Extreme Demons completed in Geometry Dash, from the provider. Never typed in by hand.';

-- Same rule as every other gd_ column: writable by its owner and by an admin,
-- through the column grant rather than by a policy.
grant update (gd_extreme_demons) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard: logged here vs beaten in game
-- ---------------------------------------------------------------------------
-- `completions_count` counts every completion. `extreme_completions_count`
-- counts only the ones that really are Extreme Demons, which is what can be
-- compared against `gd_extreme_demons`.
--
-- A level qualifies if the Geometry Dash provider calls it an Extreme Demon,
-- **or** if it carries an AREDL rank - being on that list means it is a rated
-- extreme demon, and that holds even if the provider was unreachable when the
-- level was first resolved and left `difficulty` null.
-- ---------------------------------------------------------------------------

-- `create or replace view` can only append columns, never insert one in the
-- middle - it matches by position and would try to rename completions_count.
-- Dropping and recreating inside a transaction means there is never a moment
-- where the view does not exist.
begin;

drop view if exists public.leaderboard;

create view public.leaderboard
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
  p.gd_extreme_demons,
  count(c.id)::integer                                   as completions_count,
  count(c.id) filter (
    where l.difficulty = 'Extreme Demon' or l.aredl_rank is not null
  )::integer                                             as extreme_completions_count,
  round(avg(c.enjoyment)::numeric, 2)                    as avg_enjoyment,
  round(avg(c.difficulty)::numeric, 2)                   as avg_difficulty,
  min(l.aredl_rank)                                      as best_aredl_rank,
  max(c.completed_at)                                    as last_completion_at,
  -- How many are beaten in game but not logged here. NULL when the member has
  -- no linked account, because then the question has no answer - which is not
  -- the same as "none missing".
  case
    when p.gd_extreme_demons is null then null
    else greatest(
      0,
      p.gd_extreme_demons - count(c.id) filter (
        where l.difficulty = 'Extreme Demon' or l.aredl_rank is not null
      )::integer
    )
  end                                                    as missing_extreme_demons
from public.profiles p
left join public.completions c on c.user_id = p.id
left join public.levels l on l.id = c.level_id
group by p.id;

commit;
