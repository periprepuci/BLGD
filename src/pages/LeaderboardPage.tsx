import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Star, Trophy, Users } from 'lucide-react'

import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { RowSkeletonList } from '@/components/ui/Skeleton'
import { Segmented } from '@/components/ui/Segmented'
import { Page } from '@/components/layout/Page'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useAppContext } from '@/layouts/AppLayout'
import * as leaderboardService from '@/services/leaderboard.service'
import { avatarUrl, displayNameOf } from '@/services/profiles.service'
import type { LeaderboardMetric } from '@/types/domain'
import { cn } from '@/utils/cn'
import { finiteOrNull, formatNumber, formatPoints, formatRating, pluralize } from '@/utils/format'

const OPTIONS: { value: LeaderboardMetric; label: string; title: string }[] = [
  { value: 'points', label: 'Points', title: leaderboardService.METRICS.points.description },
  { value: 'completions', label: 'Demons', title: leaderboardService.METRICS.completions.description },
  { value: 'enjoyment', label: 'Enjoyment', title: leaderboardService.METRICS.enjoyment.description },
  { value: 'difficulty', label: 'Difficulty', title: leaderboardService.METRICS.difficulty.description },
  { value: 'stars', label: 'Stars', title: leaderboardService.METRICS.stars.description },
]

/** Points, or 0 when the column is absent on an un-migrated database. */
function pointsOf(entry: { aredl_points_total: number }): number {
  return finiteOrNull(entry.aredl_points_total) ?? 0
}

function metricDisplay(metric: LeaderboardMetric, value: number | null): string {
  if (value === null) return '—'
  if (metric === 'enjoyment' || metric === 'difficulty') return formatRating(value)
  if (metric === 'points') return formatPoints(value)
  return formatNumber(value)
}

export function LeaderboardPage() {
  const { profile } = useAuth()
  const { dataVersion } = useAppContext()
  // Points first: it is the one that answers "who is best at the game", which
  // counting demons does not.
  const [metric, setMetric] = useState<LeaderboardMetric>('points')

  const board = useAsync(() => leaderboardService.getLeaderboard(metric), [metric, dataVersion])

  const meta = leaderboardService.METRICS[metric]
  const entries = board.data ?? []

  return (
    <Page
      title="Leaderboard"
      description={
        <>
          Sorted by <span className="text-ink-200">{meta.inSentence}</span> only.{' '}
          {meta.description} Nothing here is a blended score.
        </>
      }
      actions={
        <Segmented
          label="Leaderboard metric"
          options={OPTIONS}
          value={metric}
          onChange={setMetric}
        />
      }
    >
      {board.error ? (
        <ErrorState message={board.error} action={<Button onClick={board.reload}>Retry</Button>} />
      ) : board.initialLoading ? (
        <RowSkeletonList count={6} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nothing to rank yet"
          description={
            metric === 'completions'
              ? 'Once people register, they appear here.'
              : `No member has data for ${meta.inSentence} yet.`
          }
        />
      ) : (
        <ol className="panel divide-y divide-ink-800/80 overflow-hidden">
          {entries.map((entry) => {
            const isMe = entry.id === profile?.id
            const podium = entry.rank <= 3

            return (
              <li key={entry.id}>
                <Link
                  to={`/profile/${entry.username}`}
                  className={cn(
                    'flex items-center gap-3 p-4 transition hover:bg-ink-850/70 sm:gap-4',
                    isMe && 'bg-brand-500/[0.07]',
                  )}
                >
                  <span
                    className={cn(
                      'w-9 shrink-0 text-center font-display text-lg font-bold tabular-nums sm:w-12 sm:text-xl',
                      podium ? 'text-brand-400' : 'text-ink-600',
                    )}
                  >
                    {entry.rank}
                  </span>

                  <Avatar
                    src={avatarUrl(entry)}
                    name={displayNameOf(entry)}
                    size="md"
                    className={cn(podium && 'ring-2 ring-brand-500/40')}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-semibold text-ink-100">
                      {displayNameOf(entry)}
                      {isMe && (
                        <span className="shrink-0 rounded bg-brand-500/20 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-brand-300">
                          you
                        </span>
                      )}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 truncate text-xs text-ink-500">
                      <span>@{entry.username}</span>
                      {entry.gd_stars !== null && metric !== 'stars' && (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                          {formatNumber(entry.gd_stars)}
                        </span>
                      )}
                      {metric !== 'completions' && (
                        <span>
                          {entry.completions_count} {pluralize(entry.completions_count, 'demon')}
                        </span>
                      )}
                      {metric !== 'points' && pointsOf(entry) > 0 && (
                        <span>{formatPoints(pointsOf(entry))} pts</span>
                      )}
                      {metric === 'points' && entry.best_aredl_rank !== null && (
                        <span>hardest #{entry.best_aredl_rank}</span>
                      )}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'font-display text-xl font-bold tabular-nums sm:text-2xl',
                        podium ? 'text-brand-300' : 'text-ink-100',
                      )}
                    >
                      {metricDisplay(metric, entry.metricValue)}
                    </p>
                    <p className="text-[0.625rem] uppercase tracking-wider text-ink-600">
                      {meta.unit}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ol>
      )}

      {entries.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-500">
          <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
          {metric === 'points'
            ? "AREDL's own point value per level, summed. Nothing here is weighted or blended by this site."
            : metric === 'completions'
              ? 'Every member is listed, including those at zero.'
              : `Members with no ${meta.inSentence} data are left out rather than ranked last on a blank.`}
        </p>
      )}
    </Page>
  )
}
