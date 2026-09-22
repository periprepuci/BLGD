import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Swords } from 'lucide-react'

import { Badge, RankBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Input, Select } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { Page } from '@/components/layout/Page'
import { CatalogueLevelCard } from '@/components/levels/CatalogueLevelCard'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useDebounce } from '@/hooks/useDebounce'
import { useAppContext } from '@/layouts/AppLayout'
import * as gdService from '@/services/geometryDash.service'
import * as levelsService from '@/services/levels.service'
import type { GdLevel, LevelWithStats } from '@/types/domain'
import { formatCompact, pluralize } from '@/utils/format'

type SortKey = 'aredl_rank' | 'name' | 'created_at'

const PAGE_SIZE = 24

export function LevelsPage() {
  const { user } = useAuth()
  const { openAddDemon, dataVersion } = useAppContext()

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('aredl_rank')
  const [page, setPage] = useState(0)
  const [accumulated, setAccumulated] = useState<LevelWithStats[]>([])

  const debouncedSearch = useDebounce(search, 350)

  // A new search or sort restarts pagination.
  useEffect(() => {
    setPage(0)
    setAccumulated([])
  }, [debouncedSearch, sort, dataVersion])

  const levels = useAsync(
    () => levelsService.listLevels({ search: debouncedSearch, sort, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, sort, page, dataVersion],
  )

  useEffect(() => {
    if (!levels.data) return
    setAccumulated((current) =>
      levels.data!.page === 0 ? levels.data!.items : [...current, ...levels.data!.items],
    )
  }, [levels.data])

  /**
   * Second search, against Geometry Dash itself.
   *
   * Only runs once the catalogue search has come back thin, so browsing levels
   * the group has already logged never touches the provider. This is what lets
   * you find a demon nobody here has beaten yet and add it on the spot.
   */
  const [gdResults, setGdResults] = useState<GdLevel[]>([])
  const [gdSearching, setGdSearching] = useState(false)

  useEffect(() => {
    const term = debouncedSearch.trim()
    const localCount = levels.data?.total ?? 0

    if (term.length < 3 || levels.loading || localCount > 3) {
      setGdResults([])
      return
    }

    const controller = new AbortController()
    setGdSearching(true)

    gdService
      .searchLevels(term, { signal: controller.signal, count: 8 })
      .then(setGdResults)
      .catch(() => setGdResults([]))
      .finally(() => setGdSearching(false))

    return () => controller.abort()
  }, [debouncedSearch, levels.loading, levels.data?.total])

  const knownIds = new Set(accumulated.map((level) => level.gd_level_id))
  const unknownGdResults = gdResults.filter((result) => !knownIds.has(result.gdLevelId))

  return (
    <Page
      title="Levels"
      description="Every Extreme Demon anyone here has logged, with the group's average ratings."
      actions={
        user ? (
          <Button onClick={() => openAddDemon()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Extreme Demon
          </Button>
        ) : null
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            aria-label="Search levels"
            placeholder="Search by name, creator or level ID"
            leading={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            containerClassName="flex-1"
            hint={
              levels.data
                ? `${levels.data.total} ${pluralize(levels.data.total, 'level')} in the catalogue`
                : undefined
            }
          />
          <Select
            aria-label="Sort levels"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="sm:w-52"
          >
            <option value="aredl_rank">AREDL rank</option>
            <option value="name">Name</option>
            <option value="created_at">Recently added</option>
          </Select>
        </div>

        {levels.error ? (
          <ErrorState message={levels.error} action={<Button onClick={levels.reload}>Retry</Button>} />
        ) : levels.initialLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="panel overflow-hidden">
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : accumulated.length > 0 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {accumulated.map((level, index) => (
                <CatalogueLevelCard key={level.id} level={level} eager={index < 4} />
              ))}
            </div>

            {levels.data?.hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  loading={levels.loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Swords}
            title={search ? 'Nothing in the catalogue matches' : 'No levels yet'}
            description={
              search
                ? 'Nobody here has logged a level by that name. Try the Geometry Dash results below.'
                : 'Levels land here the moment someone logs a completion.'
            }
            action={
              user ? (
                <Button onClick={() => openAddDemon()}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Extreme Demon
                </Button>
              ) : null
            }
          />
        )}

        {/* --- Geometry Dash results --------------------------------------- */}
        {(unknownGdResults.length > 0 || gdSearching) && (
          <section className="space-y-3 border-t border-ink-800 pt-6">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-ink-100">
                Found in Geometry Dash
              </h2>
              <Badge tone="neutral">not logged here yet</Badge>
            </div>

            {gdSearching ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : (
              <ul className="panel divide-y divide-ink-800/80 overflow-hidden">
                {unknownGdResults.map((result) => (
                  <li
                    key={result.gdLevelId}
                    className="flex items-center gap-3 p-3 transition hover:bg-ink-850/60"
                  >
                    <RankBadge rank={null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-100">{result.name}</p>
                      <p className="truncate text-xs text-ink-500">
                        by {result.creator ?? 'Unknown'} · {formatCompact(result.downloads)} plays ·
                        ID {result.gdLevelId}
                      </p>
                    </div>
                    {user ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAddDemon({ gdLevelId: result.gdLevelId })}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Log it
                      </Button>
                    ) : (
                      <Link
                        to="/login"
                        className="shrink-0 text-xs font-semibold text-brand-400 hover:underline"
                      >
                        Log in to add
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Page>
  )
}
