import { Gauge, Heart, RefreshCw, Skull, Star, Trophy } from 'lucide-react'

import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { StatTile } from '@/components/ui/StatTile'
import type { ProfileRow } from '@/types/database'
import { formatNumber, formatRating, formatRelative, ordinal } from '@/utils/format'
import { avatarUrl, displayNameOf } from '@/services/profiles.service'

export interface ProfileHeaderProps {
  profile: ProfileRow
  stats: {
    total: number
    avgEnjoyment: number | null
    avgDifficulty: number | null
    bestRank: number | null
  }
  /** Position on the "Extreme Demons completed" leaderboard, when known. */
  leaderboardRank?: number | null
  /** Sum of AREDL's point value across this member's completions. */
  aredlPoints?: number | null
  isOwnProfile?: boolean
  onRefreshStats?: () => void
  refreshing?: boolean
}

export function ProfileHeader({
  profile,
  stats,
  leaderboardRank,
  aredlPoints = null,
  isOwnProfile = false,
  onRefreshStats,
  refreshing = false,
}: ProfileHeaderProps) {
  const name = displayNameOf(profile)
  const linked = Boolean(profile.gd_username)

  return (
    <header className="panel overflow-hidden">
      {/* A very restrained accent band, so the header reads as a header without
          turning into a hero image. */}
      <div
        className="h-20 bg-gradient-to-r from-brand-600/25 via-brand-500/10 to-transparent sm:h-24"
        aria-hidden="true"
      />

      <div className="px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="-mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end">
          <Avatar
            src={avatarUrl(profile)}
            name={name}
            size="xl"
            className="ring-4 ring-ink-900"
          />

          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-2xl sm:text-3xl">{name}</h1>
              {profile.is_admin && <Badge tone="brand">Admin</Badge>}
              {leaderboardRank && (
                <Badge tone="neutral" title="Rank by Extreme Demons completed here">
                  <Trophy className="h-3 w-3" aria-hidden="true" />
                  {ordinal(leaderboardRank)}
                </Badge>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-ink-500">@{profile.username}</span>

              {linked ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300">
                  <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                  {formatNumber(profile.gd_stars)}
                  <span className="font-normal text-ink-500">stars</span>
                </span>
              ) : (
                <span className="text-ink-500">No Geometry Dash account linked</span>
              )}

              {aredlPoints !== null && aredlPoints > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 font-semibold text-brand-300"
                  title="Sum of AREDL's own point value across every logged demon"
                >
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  {formatNumber(Math.round(aredlPoints))}
                  <span className="font-normal text-ink-500">AREDL points</span>
                </span>
              )}

              {linked && profile.gd_username !== profile.username && (
                <span className="text-ink-500">GD: {profile.gd_username}</span>
              )}
            </div>

            {profile.bio && (
              <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-ink-400">{profile.bio}</p>
            )}
          </div>

          {linked && onRefreshStats && (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onRefreshStats}
                loading={refreshing}
                title="Re-read stars and demons from Geometry Dash"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Refresh stats
              </Button>
              <span className="text-[0.6875rem] text-ink-600">
                Synced {formatRelative(profile.gd_synced_at)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Extreme Demons"
            value={
              profile.gd_extreme_demons === null ? (
                stats.total
              ) : (
                <>
                  {stats.total}
                  <span className="text-lg font-medium text-ink-500">
                    {' / '}
                    {profile.gd_extreme_demons}
                  </span>
                </>
              )
            }
            detail={
              profile.gd_extreme_demons === null
                ? isOwnProfile
                  ? 'logged by you'
                  : 'logged here'
                : 'logged here / beaten in game'
            }
            icon={Skull}
            tone="brand"
          />
          <StatTile
            label="Avg enjoyment"
            value={
              <>
                {formatRating(stats.avgEnjoyment)}
                <span className="text-base font-medium text-ink-500"> / 10</span>
              </>
            }
            detail="across every demon"
            icon={Heart}
          />
          <StatTile
            label="Avg difficulty"
            value={
              <>
                {formatRating(stats.avgDifficulty)}
                <span className="text-base font-medium text-ink-500"> / 10</span>
              </>
            }
            detail="personal rating"
            icon={Gauge}
          />
          <StatTile
            label="Hardest"
            value={stats.bestRank ? `#${stats.bestRank}` : '—'}
            detail={stats.bestRank ? 'best AREDL rank' : 'no ranked demons yet'}
            icon={Trophy}
          />
        </div>
      </div>
    </header>
  )
}
