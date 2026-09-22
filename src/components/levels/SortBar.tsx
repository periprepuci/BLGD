import { ArrowDown, ArrowUp } from 'lucide-react'

import { cn } from '@/utils/cn'
import type { CompletionSortKey, SortState } from '@/types/domain'

const OPTIONS: { key: CompletionSortKey; label: string; defaultDirection: 'asc' | 'desc' }[] = [
  // Ascending for rank: #1 is the achievement, so it belongs at the top.
  { key: 'aredl_rank', label: 'AREDL rank', defaultDirection: 'asc' },
  { key: 'completed_at', label: 'Date', defaultDirection: 'desc' },
  { key: 'enjoyment', label: 'Enjoyment', defaultDirection: 'desc' },
  { key: 'difficulty', label: 'Difficulty', defaultDirection: 'desc' },
  { key: 'name', label: 'Name', defaultDirection: 'asc' },
]

export function SortBar({
  sort,
  onChange,
  className,
}: {
  sort: SortState
  onChange: (sort: SortState) => void
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label="Sort levels"
    >
      <span className="stat-label mr-1">Sort</span>

      {OPTIONS.map((option) => {
        const active = sort.key === option.key
        const Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown

        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(
                active
                  ? { key: option.key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
                  : { key: option.key, direction: option.defaultDirection },
              )
            }
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition',
              active
                ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                : 'border-ink-750 bg-ink-900/60 text-ink-400 hover:border-ink-600 hover:text-ink-200',
            )}
          >
            {option.label}
            {active && <Icon className="h-3 w-3" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}
