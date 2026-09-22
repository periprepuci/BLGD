-- ===========================================================================
-- BLGD - total AREDL points per member
-- ===========================================================================
-- Run after the four earlier migrations.
--
-- "How many have you beaten" rewards volume: twenty easy extremes outrank three
-- brutal ones. AREDL already solves that - it assigns each level a point value
-- that falls as the list goes on, so the sum across someone's completions is a
-- measure of difficulty rather than of appetite.
--
--   Congregation  #272   1288 points
--   Bloodbath     #840    372 points
--
-- This is AREDL's own number, not an invention of this site: no weights chosen
-- here, no blending of unrelated figures. It is one column, summed.
--
-- Levels that are not on the list contribute nothing, because they have no
-- points - and `sum` skips NULLs, so no filtering is needed for that.
-- ===========================================================================

-- Appended at the end: CREATE OR REPLACE VIEW matches columns by position and
-- can add to the tail, but never insert in the middle.
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
  p.gd_extreme_demons,
  count(c.id)::integer                                   as completions_count,
  count(c.id) filter (
    where l.difficulty = 'Extreme Demon' or l.aredl_rank is not null
  )::integer                                             as extreme_completions_count,
  round(avg(c.enjoyment)::numeric, 2)                    as avg_enjoyment,
  round(avg(c.difficulty)::numeric, 2)                   as avg_difficulty,
  min(l.aredl_rank)                                      as best_aredl_rank,
  max(c.completed_at)                                    as last_completion_at,
  case
    when p.gd_extreme_demons is null then null
    else greatest(
      0,
      p.gd_extreme_demons - count(c.id) filter (
        where l.difficulty = 'Extreme Demon' or l.aredl_rank is not null
      )::integer
    )
  end                                                    as missing_extreme_demons,
  -- coalesce so a member with nothing logged reads 0 rather than NULL: unlike
  -- the "missing" figure above, zero here is a real answer.
  coalesce(sum(l.aredl_points), 0)::numeric(12, 2)       as aredl_points_total
from public.profiles p
left join public.completions c on c.user_id = p.id
left join public.levels l on l.id = c.level_id
group by p.id;
