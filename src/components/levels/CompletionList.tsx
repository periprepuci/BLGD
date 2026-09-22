import { useMemo, useState } from 'react'
import { Search, Skull } from 'lucide-react'

import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Field'
import { LevelCardSkeletonList } from '@/components/ui/Skeleton'
import { sortCompletions } from '@/services/completions.service'
import type { CompletionWithLevel, SortState } from '@/types/domain'
import { LevelCard } from './LevelCard'
import { SortBar } from './SortBar'

export interface CompletionListProps {
  completions: CompletionWithLevel[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  /** Only passed for the viewer's own list. */
  onEdit?: (completion: CompletionWithLevel) => void
  onDelete?: (completion: CompletionWithLevel) => void
  /** Renders a filter box above the list once there are enough rows to need one. */
  searchable?: boolean
  /** How many to render before "show more". Keeps long profiles snappy. */
  pageSize?: number
}

export function CompletionList({
  completions,
  loading = false,
  emptyTitle = 'No Extreme Demons yet',
  emptyDescription,
  emptyAction,
  onEdit,
  onDelete,
  searchable = true,
  pageSize = 12,
}: CompletionListProps) {
  const [sort, setSort] = useState<SortState>({ key: 'aredl_rank', direction: 'asc' })
  const [filter, setFilter] = useState('')
  const [visible, setVisible] = useState(pageSize)

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return completions

    return completions.filter(
      ({ level }) =>
        level.name.toLowerCase().includes(term) ||
        level.creator?.toLowerCase().includes(term) ||
        String(level.gd_level_id).includes(term),
    )
  }, [completions, filter])

  const sorted = useMemo(
    () => sortCompletions(filtered, sort.key, sort.direction),
    [filtered, sort],
  )

  if (loading) return <LevelCardSkeletonList count={3} />

  if (completions.length === 0) {
    return (
      <EmptyState
        icon={Skull}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  const shown = sorted.slice(0, visible)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SortBar sort={sort} onChange={setSort} />

        {searchable && completions.length > 5 && (
          <Input
            aria-label="Filter these levels"
            placeholder="Filter by name, creator or ID"
            leading={<Search className="h-4 w-4" />}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value)
              setVisible(pageSize)
            }}
            containerClassName="lg:w-72"
          />
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing matches that"
          description="Try a different name, creator or level ID."
          variant="inline"
        />
      ) : (
        <>
          <div className="space-y-3">
            {shown.map((completion, index) => (
              <LevelCard
                key={completion.id}
                completion={completion}
                onEdit={onEdit}
                onDelete={onDelete}
                // The first card is above the fold; everything else lazy-loads.
                eager={index === 0}
              />
            ))}
          </div>

          {visible < sorted.length && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisible((value) => value + pageSize)}
                className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-ink-300 transition hover:border-brand-500/50 hover:text-brand-300"
              >
                Show {Math.min(pageSize, sorted.length - visible)} more
                <span className="ml-1.5 text-ink-500">({sorted.length - visible} left)</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
