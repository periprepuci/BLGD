import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'

import { RankBadge } from '@/components/ui/Badge'
import { cn } from '@/utils/cn'
import { formatRating, pluralize } from '@/utils/format'
import type { LevelWithStats } from '@/types/domain'
import { LevelThumbnail } from './LevelThumbnail'

/**
 * A level in the shared catalogue, showing the group's averages rather than one
 * person's ratings. Used on /levels.
 */
export function CatalogueLevelCard({
  level,
  eager = false,
  className,
}: {
  level: LevelWithStats
  eager?: boolean
  className?: string
}) {
  return (
    <Link
      to={`/levels/${level.id}`}
      className={cn(
        'group panel block overflow-hidden transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-card-hover',
        className,
      )}
    >
      <div className="relative">
        <LevelThumbnail level={level} className="aspect-video w-full" eager={eager} />
        <div className="absolute left-3 top-3">
          <RankBadge rank={level.aredl_rank} status={level.aredl_status} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-base leading-tight transition-colors group-hover:text-brand-400">
            {level.name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-ink-400">
            by {level.creator ?? 'Unknown creator'}
          </p>
        </div>

        <div className="flex items-end justify-between gap-3 border-t border-ink-800 pt-3">
          <div className="flex gap-4">
            <div>
              <p className="stat-label">Enjoy</p>
              <p className="font-display text-sm font-bold tabular-nums text-ink-100">
                {formatRating(level.avg_enjoyment)}
              </p>
            </div>
            <div>
              <p className="stat-label">Diff</p>
              <p className="font-display text-sm font-bold tabular-nums text-ink-100">
                {formatRating(level.avg_difficulty)}
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 text-xs text-ink-500">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {level.completions_count} {pluralize(level.completions_count, 'beat', 'beats')}
          </span>
        </div>
      </div>
    </Link>
  )
}
