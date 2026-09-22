import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Skull, Star, Trophy, Users } from 'lucide-react'

import { Avatar } from '@/components/ui/Avatar'
import { RankBadge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LevelCardSkeletonList, RowSkeletonList } from '@/components/ui/Skeleton'
import { LevelCard } from '@/components/levels/LevelCard'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { env } from '@/lib/env'
import * as completionsService from '@/services/completions.service'
import * as leaderboardService from '@/services/leaderboard.service'
import * as levelsService from '@/services/levels.service'
import { avatarUrl, displayNameOf } from '@/services/profiles.service'
import { formatNumber, formatRating, ordinal, pluralize } from '@/utils/format'

export function HomePage() {
  const { user } = useAuth()

  useEffect(() => {
    document.title = `${env.siteName} — Track your Extreme Demons`
  }, [])

  const recent = useAsync(() => completionsService.listRecentCompletions(4), [])
  const board = useAsync(() => leaderboardService.getLeaderboard('completions'), [])
  const hardest = useAsync(
    () => levelsService.listLevels({ pageSize: 6, sort: 'aredl_rank' }),
    [],
  )

  const topFive = (board.data ?? []).slice(0, 5)

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      {/* --- hero ---------------------------------------------------------- */}
      <section className="mb-14 max-w-3xl">
        <p className="stat-label mb-3">Private Extreme Demon log</p>
        <h1 className="text-4xl leading-[1.08] sm:text-5xl lg:text-6xl">
          Track your{' '}
          <span className="text-brand-400">Extreme Demons</span>.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">
          Log every demon you beat, rate it on your own terms, and see how the same level felt to
          everyone else. Live AREDL ranks, live star counts, no points system to game.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {user ? (
            <ButtonLink to="/dashboard" size="lg">
              Go to dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/register" size="lg">
                Register
              </ButtonLink>
              <ButtonLink to="/login" variant="secondary" size="lg">
                Log in
              </ButtonLink>
            </>
          )}
          <ButtonLink to="/levels" variant="ghost" size="lg">
            Browse levels
          </ButtonLink>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-10">
        {/* --- recent completions ----------------------------------------- */}
        <section className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink-100">Latest completions</h2>
            <Link
              to="/levels"
              className="text-sm font-semibold text-ink-400 transition hover:text-brand-400"
            >
              All levels
            </Link>
          </div>

          {recent.initialLoading ? (
            <LevelCardSkeletonList count={2} />
          ) : recent.data && recent.data.length > 0 ? (
            <div className="space-y-3">
              {recent.data.map((completion, index) => (
                <LevelCard
                  key={completion.id}
                  completion={completion}
                  byline={{
                    username: completion.profile.username,
                    label: displayNameOf(completion.profile),
                  }}
                  eager={index === 0}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Skull}
              title="Nothing logged yet"
              description={
                user
                  ? 'Be the first. Add an Extreme Demon from your dashboard.'
                  : 'Once someone registers and logs a demon, it shows up here.'
              }
              action={
                user ? (
                  <ButtonLink to="/dashboard">Go to dashboard</ButtonLink>
                ) : (
                  <ButtonLink to="/register">Register</ButtonLink>
                )
              }
            />
          )}
        </section>

        {/* --- sidebar ------------------------------------------------------ */}
        <div className="min-w-0 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-ink-100">Leaderboard</h2>
              <Link
                to="/leaderboard"
                className="text-sm font-semibold text-ink-400 transition hover:text-brand-400"
              >
                Full board
              </Link>
            </div>

            {board.initialLoading ? (
              <RowSkeletonList count={4} />
            ) : topFive.length > 0 ? (
              <ol className="panel divide-y divide-ink-800/80 overflow-hidden">
                {topFive.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      to={`/profile/${entry.username}`}
                      className="flex items-center gap-3 p-3 transition hover:bg-ink-850/70"
                    >
                      <span className="w-7 shrink-0 text-center font-display text-sm font-bold tabular-nums text-ink-500">
                        {ordinal(entry.rank)}
                      </span>
                      <Avatar
                        src={avatarUrl(entry)}
                        name={displayNameOf(entry)}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-100">
                          {displayNameOf(entry)}
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {entry.gd_stars !== null && (
                            <>
                              <Star
                                className="mr-1 inline h-3 w-3 fill-amber-400 text-amber-400"
                                aria-hidden="true"
                              />
                              {formatNumber(entry.gd_stars)}
                            </>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-base font-bold tabular-nums text-brand-300">
                          {entry.completions_count}
                        </span>
                        <span className="block text-[0.625rem] uppercase tracking-wider text-ink-600">
                          {pluralize(entry.completions_count, 'demon')}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                icon={Users}
                title="No members yet"
                description="The leaderboard fills in as people register and log demons."
              />
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-ink-100">Hardest logged</h2>
              <Link
                to="/aredl"
                className="text-sm font-semibold text-ink-400 transition hover:text-brand-400"
              >
                AREDL list
              </Link>
            </div>

            {hardest.initialLoading ? (
              <RowSkeletonList count={4} />
            ) : hardest.data && hardest.data.items.length > 0 ? (
              <ol className="panel divide-y divide-ink-800/80 overflow-hidden">
                {hardest.data.items.slice(0, 6).map((level) => (
                  <li key={level.id}>
                    <Link
                      to={`/levels/${level.id}`}
                      className="flex items-center gap-3 p-3 transition hover:bg-ink-850/70"
                    >
                      <RankBadge rank={level.aredl_rank} status={level.aredl_status} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-100">
                          {level.name}
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {level.creator ?? 'Unknown creator'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-sm font-bold tabular-nums text-ink-200">
                          {formatRating(level.avg_difficulty)}
                        </span>
                        <span className="block text-[0.625rem] uppercase tracking-wider text-ink-600">
                          diff
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                icon={Trophy}
                title="No levels yet"
                description="Levels appear here once someone logs a completion."
              />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
