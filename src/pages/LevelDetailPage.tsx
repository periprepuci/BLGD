import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ExternalLink,
  Heart,
  Music,
  Play,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Trophy,
  Users,
} from 'lucide-react'

import { Avatar } from '@/components/ui/Avatar'
import { Badge, RankBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { RowSkeletonList, Skeleton } from '@/components/ui/Skeleton'
import { StatTile } from '@/components/ui/StatTile'
import { Page, Section } from '@/components/layout/Page'
import { LevelThumbnail } from '@/components/levels/LevelThumbnail'
import { useAction, useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useAppContext } from '@/layouts/AppLayout'
import * as completionsService from '@/services/completions.service'
import * as levelsService from '@/services/levels.service'
import { avatarUrl, displayNameOf } from '@/services/profiles.service'
import {
  formatCompact,
  formatDate,
  formatPoints,
  formatRating,
  formatRelative,
} from '@/utils/format'
import { watchUrl } from '@/utils/youtube'

export function LevelDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { openAddDemon, dataVersion } = useAppContext()
  const toast = useToast()

  const [refreshedAt, setRefreshedAt] = useState(0)

  const level = useAsync(() => levelsService.getLevelById(id), [id, dataVersion, refreshedAt])
  const completions = useAsync(
    () => completionsService.listLevelCompletions(id),
    [id, dataVersion],
  )

  const refresh = useAction(async () => {
    if (!level.data) return null
    const updated = await levelsService.refreshLevel(level.data.gd_level_id)
    setRefreshedAt(Date.now())
    return updated
  })

  const onRefresh = async () => {
    const updated = await refresh.run()
    if (updated) toast.success('Level refreshed', `AREDL rank: ${updated.aredl_rank ?? 'unranked'}`)
    else if (refresh.error) toast.error('Could not refresh', refresh.error)
  }

  const alreadyLogged = completions.data?.some((entry) => entry.profile.id === user?.id) ?? false

  if (level.initialLoading) {
    return (
      <Page title="Level" description="Loading…">
        <div className="space-y-8">
          <Skeleton className="aspect-[21/9] w-full rounded-2xl" />
          <RowSkeletonList count={3} />
        </div>
      </Page>
    )
  }

  if (level.error) {
    return (
      <Page title="Level">
        <ErrorState message={level.error} action={<ButtonLink to="/levels">All levels</ButtonLink>} />
      </Page>
    )
  }

  if (!level.data) {
    return (
      <Page title="Level not found" documentTitle="Not found">
        <EmptyState
          icon={Search}
          title="No level with that ID"
          description="It may have been removed by an admin."
          action={<ButtonLink to="/levels">Browse levels</ButtonLink>}
        />
      </Page>
    )
  }

  const data = level.data
  const verificationVideo = data.verification_video_url

  return (
    <Page
      title={data.name}
      documentTitle={data.name}
      description={null}
      className="pt-6"
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={onRefresh} loading={refresh.pending}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
          {user && !alreadyLogged && (
            <Button onClick={() => openAddDemon({ gdLevelId: data.gd_level_id })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              I beat this
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-8">
        <Link
          to="/levels"
          className="inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-brand-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All levels
        </Link>

        {/* --- banner ------------------------------------------------------ */}
        <section className="panel overflow-hidden">
          <div className="relative aspect-[21/9] w-full max-h-[26rem]">
            <LevelThumbnail level={data} className="absolute inset-0 h-full w-full" eager />
            <div
              className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-transparent"
              aria-hidden="true"
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-5 sm:p-7">
              <div className="min-w-0">
                <h1 className="break-words text-3xl leading-tight sm:text-4xl">{data.name}</h1>
                <p className="mt-1.5 text-base text-ink-300">
                  by <span className="text-ink-100">{data.creator ?? 'Unknown creator'}</span>
                </p>
              </div>
              <RankBadge rank={data.aredl_rank} status={data.aredl_status} size="lg" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-ink-800 px-5 py-4 sm:px-7">
            <Badge tone="neutral" className="font-mono">
              ID {data.gd_level_id}
            </Badge>
            {data.difficulty && <Badge tone="brand">{data.difficulty}</Badge>}
            {data.length && (
              <Badge tone="neutral">
                <Ruler className="h-3 w-3" aria-hidden="true" />
                {data.length}
              </Badge>
            )}
            {data.song_name && (
              <Badge tone="neutral" title={data.song_name}>
                <Music className="h-3 w-3" aria-hidden="true" />
                <span className="max-w-[12rem] truncate">{data.song_name}</span>
              </Badge>
            )}
            {data.likes !== null && (
              <Badge tone="neutral">
                <Heart className="h-3 w-3" aria-hidden="true" />
                {formatCompact(data.likes)}
              </Badge>
            )}
            {data.gddl_tier !== null && (
              <Badge tone="info" title="Geometry Dash Demon Ladder tier, via AREDL">
                GDDL {data.gddl_tier}
              </Badge>
            )}
            {data.tags.slice(0, 6).map((tag) => (
              <Badge key={tag} tone="neutral">
                {tag}
              </Badge>
            ))}

            <span className="ml-auto text-[0.6875rem] text-ink-600">
              AREDL synced {formatRelative(data.aredl_synced_at)}
            </span>
          </div>

          {data.description && (
            <p className="border-t border-ink-800 px-5 py-4 text-sm leading-relaxed text-ink-400 sm:px-7">
              {data.description}
            </p>
          )}
        </section>

        {/* --- aggregate stats --------------------------------------------- */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="AREDL points"
            value={formatPoints(data.aredl_points)}
            detail={data.aredl_rank ? `worth this at #${data.aredl_rank}` : 'not on the list'}
            icon={Trophy}
            tone="brand"
          />
          <StatTile
            label="Beaten by"
            value={data.completions_count}
            detail="members here"
            icon={Users}
          />
          <StatTile
            label="Avg enjoyment"
            value={
              <>
                {formatRating(data.avg_enjoyment)}
                <span className="text-base font-medium text-ink-500"> / 10</span>
              </>
            }
          />
          <StatTile
            label="Avg difficulty"
            value={
              <>
                {formatRating(data.avg_difficulty)}
                <span className="text-base font-medium text-ink-500"> / 10</span>
              </>
            }
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            href={`https://gdbrowser.com/${data.gd_level_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-xs font-semibold text-ink-200 transition hover:border-brand-500/50 hover:text-brand-300"
          >
            Open on GDBrowser
            <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
          </a>
          {verificationVideo && (
            <a
              href={verificationVideo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-xs font-semibold text-ink-200 transition hover:border-brand-500/50 hover:text-brand-300"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              AREDL verification
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
            </a>
          )}
        </div>

        {/* --- community completions --------------------------------------- */}
        <Section title="Community completions">
          {completions.initialLoading ? (
            <RowSkeletonList count={3} />
          ) : completions.data && completions.data.length > 0 ? (
            <ul className="panel divide-y divide-ink-800/80 overflow-hidden">
              {completions.data.map((entry) => {
                const video = watchUrl(entry.youtube_video_id)
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center gap-4 p-4 transition hover:bg-ink-850/50"
                  >
                    <Link
                      to={`/profile/${entry.profile.username}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Avatar
                        src={avatarUrl(entry.profile)}
                        name={displayNameOf(entry.profile)}
                        size="md"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink-100 transition hover:text-brand-400">
                          {displayNameOf(entry.profile)}
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {formatDate(entry.completed_at)}
                        </span>
                      </span>
                    </Link>

                    <div className="flex items-center gap-5 sm:gap-7">
                      <div className="text-right">
                        <p className="stat-label">Enjoy</p>
                        <p className="font-display text-lg font-bold tabular-nums text-brand-300">
                          {formatRating(entry.enjoyment)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="stat-label">Diff</p>
                        <p className="font-display text-lg font-bold tabular-nums text-sky-300">
                          {formatRating(entry.difficulty)}
                        </p>
                      </div>

                      {video ? (
                        <a
                          href={video}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Watch ${displayNameOf(entry.profile)}'s completion`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs font-semibold text-ink-200 transition hover:border-brand-500/50 hover:text-brand-300"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                          <span className="hidden sm:inline">Video</span>
                        </a>
                      ) : (
                        <span className="w-[4.5rem] text-right text-xs text-ink-600">No video</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Users}
              title="Nobody has logged this one yet"
              description={
                user
                  ? 'If you have beaten it, you can be the first.'
                  : 'Log in to add your completion.'
              }
              action={
                user ? (
                  <Button onClick={() => openAddDemon({ gdLevelId: data.gd_level_id })}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    I beat this
                  </Button>
                ) : (
                  <ButtonLink to="/login">Log in</ButtonLink>
                )
              }
            />
          )}
        </Section>
      </div>
    </Page>
  )
}
