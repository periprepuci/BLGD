/**
 * Leaderboard.
 *
 * Requirement 10 is explicit: no composite score that blends unrelated numbers
 * into one meaningless rank. Each metric sorts by exactly one column and the UI
 * says which. Players with no data for the selected metric are excluded rather
 * than ranked last on a null, which would read as "worst" when it means
 * "unknown".
 */

import { describeError, requireSupabase } from '@/lib/supabase'
import type { LeaderboardRow } from '@/types/database'
import type { LeaderboardMetric } from '@/types/domain'

export interface LeaderboardEntry extends LeaderboardRow {
  rank: number
  /** The value this row was ranked on, already selected for the metric. */
  metricValue: number | null
}

export const METRICS: Record<
  LeaderboardMetric,
  { label: string; description: string; unit: string }
> = {
  points: {
    label: 'AREDL points',
    description:
      "Sum of AREDL's own point value for every demon logged here. Harder levels are " +
      'worth more, so this rewards difficulty rather than volume.',
    unit: 'points',
  },
  completions: {
    label: 'Extreme Demons',
    description: 'Number of Extreme Demons logged on this site.',
    unit: 'demons',
  },
  enjoyment: {
    label: 'Avg enjoyment',
    description: 'Mean personal enjoyment rating across every logged demon.',
    unit: '/10',
  },
  difficulty: {
    label: 'Avg difficulty',
    description: 'Mean personal difficulty rating across every logged demon.',
    unit: '/10',
  },
  stars: {
    label: 'Stars',
    description: 'Live star count from the linked Geometry Dash account.',
    unit: 'stars',
  },
}

function valueFor(row: LeaderboardRow, metric: LeaderboardMetric): number | null {
  switch (metric) {
    case 'points':
      return row.aredl_points_total === null ? null : Number(row.aredl_points_total)
    case 'completions':
      return row.completions_count
    case 'enjoyment':
      return row.avg_enjoyment === null ? null : Number(row.avg_enjoyment)
    case 'difficulty':
      return row.avg_difficulty === null ? null : Number(row.avg_difficulty)
    case 'stars':
      return row.gd_stars
  }
}

export async function getLeaderboard(metric: LeaderboardMetric): Promise<LeaderboardEntry[]> {
  const client = requireSupabase()

  const { data, error } = await client.from('leaderboard').select('*')
  if (error) throw new Error(describeError(error))

  const rows = (data ?? []) as LeaderboardRow[]

  return rows
    .map((row) => ({ row, metricValue: valueFor(row, metric) }))
    // "completions" and "points" keep everyone, including members at zero -
    // being at the start of the list is real information, and zero points is a
    // real answer. The averages and the star count need data to mean anything.
    .filter(({ metricValue }) =>
      metric === 'completions' || metric === 'points'
        ? true
        : metricValue !== null && metricValue > 0,
    )
    .sort((a, b) => {
      const diff = (b.metricValue ?? 0) - (a.metricValue ?? 0)
      if (diff !== 0) return diff
      // Stable, explicable tie-break rather than whatever order the DB returned.
      if (b.row.completions_count !== a.row.completions_count) {
        return b.row.completions_count - a.row.completions_count
      }
      return a.row.username.localeCompare(b.row.username)
    })
    .map(({ row, metricValue }, index) => ({ ...row, rank: index + 1, metricValue }))
}

/** Where a given member sits for a metric, for the "your rank" line. */
export function findRank(
  entries: LeaderboardEntry[],
  profileId: string | null | undefined,
): LeaderboardEntry | null {
  if (!profileId) return null
  return entries.find((entry) => entry.id === profileId) ?? null
}

export async function getProfileSummary(profileId: string): Promise<LeaderboardRow | null> {
  const client = requireSupabase()

  const { data, error } = await client.from('leaderboard').select('*').eq('id', profileId).maybeSingle()
  if (error) throw new Error(describeError(error))
  return data as LeaderboardRow | null
}

export async function countMembers(): Promise<number> {
  const client = requireSupabase()
  const { count, error } = await client
    .from('profiles')
    .select('id', { count: 'exact', head: true })

  if (error) throw new Error(describeError(error))
  return count ?? 0
}
