import { Link } from 'react-router-dom'
import { Calendar, ExternalLink, Pencil, Play, Trash2, Trophy, User } from 'lucide-react'

import { RankBadge } from '@/components/ui/Badge'
import { cn } from '@/utils/cn'
import { formatDate, formatPoints, formatRating } from '@/utils/format'
import { watchUrl } from '@/utils/youtube'
import type { CompletionWithLevel } from '@/types/domain'
import { LevelThumbnail } from './LevelThumbnail'

export interface LevelCardProps {
  completion: CompletionWithLevel
  /** Shown on feeds where the card is not already under someone's name. */
  byline?: { username: string; label: string } | null
  /** Edit and delete are only rendered for the row's owner. */
  onEdit?: (completion: CompletionWithLevel) => void
  onDelete?: (completion: CompletionWithLevel) => void
  eager?: boolean
  className?: string
}

function RatingReadout({
  label,
  value,
  tone,
}: {
  label: string
  value: number | null
  tone: 'brand' | 'sky'
}) {
  const percent = value === null ? 0 : (value / 10) * 100

  return (
    <div className="min-w-[5.5rem] flex-1 sm:flex-none">
      <p className="stat-label">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold leading-none tabular-nums text-ink-100">
        {formatRating(value)}
        <span className="text-sm font-medium text-ink-500"> / 10</span>
      </p>
      {/* A 3px bar is enough to compare two numbers at a glance without
          turning every card into a chart. */}
      <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-ink-750">
        <div
          className={cn('h-full rounded-full', tone === 'brand' ? 'bg-brand-500' : 'bg-sky-500')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/**
 * The card a logged Extreme Demon appears as.
 *
 * Horizontal banner on desktop, stacked on phones. The information order is
 * rank, name, creator, ratings, video - the same order you would read it out
 * loud. Hover lifts the card very slightly and warms the border; nothing moves
 * far enough to cost a frame.
 */
export function LevelCard({
  completion,
  byline,
  onEdit,
  onDelete,
  eager = false,
  className,
}: LevelCardProps) {
  const { level } = completion
  const video = watchUrl(completion.youtube_video_id)

  return (
    <article
      className={cn(
        'group panel overflow-hidden transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-card-hover',
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row">
        <Link
          to={`/levels/${level.id}`}
          className="relative block shrink-0 sm:w-64 lg:w-80"
          aria-label={`Open ${level.name}`}
        >
          <LevelThumbnail
            level={level}
            completionVideoId={completion.youtube_video_id}
            className="aspect-video w-full sm:h-full sm:min-h-[9.5rem]"
            eager={eager}
          />
          <div className="absolute left-3 top-3">
            <RankBadge rank={level.aredl_rank} status={level.aredl_status} />
          </div>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-lg leading-tight">
                <Link
                  to={`/levels/${level.id}`}
                  className="break-words transition-colors hover:text-brand-400"
                >
                  {level.name}
                </Link>
              </h3>

              {(onEdit || onDelete) && (
                <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(completion)}
                      aria-label={`Edit your ratings for ${level.name}`}
                      className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(completion)}
                      aria-label={`Remove ${level.name} from your profile`}
                      className="rounded-md p-1.5 text-ink-400 transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <p className="mt-1 truncate text-sm text-ink-400">
              by <span className="text-ink-300">{level.creator ?? 'Unknown creator'}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <RatingReadout label="Enjoyment" value={completion.enjoyment} tone="brand" />
            <RatingReadout label="Difficulty" value={completion.difficulty} tone="sky" />
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            {video ? (
              <a
                href={video}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs font-semibold text-ink-200 transition hover:border-brand-500/50 hover:text-brand-300"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Completion
                <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
              </a>
            ) : (
              <span className="text-xs text-ink-600">No completion video</span>
            )}

            <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDate(completion.completed_at)}
            </span>

            {byline && (
              <Link
                to={`/profile/${byline.username}`}
                className="inline-flex items-center gap-1.5 text-xs text-ink-500 transition hover:text-brand-400"
              >
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                {byline.label}
              </Link>
            )}

            {level.aredl_points !== null && (
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300"
                title="What this level is worth on the AREDL list"
              >
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                {formatPoints(level.aredl_points)}
                <span className="font-normal text-ink-500">pts</span>
              </span>
            )}

            <span className="ml-auto hidden font-mono text-[0.6875rem] text-ink-600 sm:inline">
              ID {level.gd_level_id}
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
