import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, ListOrdered, RefreshCw, Search } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Field'
import { RowSkeletonList } from '@/components/ui/Skeleton'
import { Page } from '@/components/layout/Page'
import { useAction, useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/hooks/useToast'
import * as aredlService from '@/services/aredl.service'
import * as levelsService from '@/services/levels.service'
import { formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'

const PAGE = 60

const EMPTY_INDEX = new Map<number, string>()

/**
 * The live AREDL ranking.
 *
 * Read from our own mirror when the `sync-aredl` Edge Function has populated
 * it, and straight from api.aredl.net otherwise. The badge at the top says
 * which, because "where did this number come from" is a fair question.
 */
export function AredlPage() {
  const { user } = useAuth()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(PAGE)
  const [reloadKey, setReloadKey] = useState(0)

  const debounced = useDebounce(search, 300)

  const list = useAsync(
    (signal) => aredlService.getRankedLevels({ signal }),
    [reloadKey],
  )

  // Which of these levels someone here has already logged, so the page can link
  // through to our own level page instead of dead-ending.
  const logged = useAsync(() => levelsService.getLoggedLevelIndex(), [reloadKey])
  const loggedByGdId = logged.data ?? EMPTY_INDEX

  useEffect(() => setVisible(PAGE), [debounced])

  const filtered = useMemo(() => {
    const entries = list.data?.entries ?? []
    const term = debounced.trim().toLowerCase()
    if (!term) return entries

    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(term) ||
        String(entry.gdLevelId).includes(term) ||
        String(entry.position) === term,
    )
  }, [list.data, debounced])

  const refresh = useAction(async () => {
    const result = await aredlService.syncRankings()
    setReloadKey((value) => value + 1)
    return result
  })

  const onRefresh = async () => {
    const result = await refresh.run()
    if (result) toast.success('AREDL refreshed', result.message)
    else if (refresh.error) toast.error('Sync failed', refresh.error)
  }

  return (
    <Page
      title="AREDL list"
      description="The live All Rated Extreme Demons List ranking, straight from the public AREDL API."
      actions={
        user ? (
          <Button variant="outline" size="sm" onClick={onRefresh} loading={refresh.pending}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        ) : null
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            aria-label="Search the AREDL list"
            placeholder="Search by name, position or level ID"
            leading={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            containerClassName="sm:max-w-md sm:flex-1"
          />

          {list.data && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <Badge tone={list.data.source === 'mirror' ? 'success' : 'info'}>
                {list.data.source === 'mirror' ? 'from our mirror' : 'live from AREDL'}
              </Badge>
              <span>
                {list.data.entries.length} levels · updated {formatRelative(list.data.syncedAt)}
              </span>
              <a
                href="https://aredl.net"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition hover:text-brand-400"
              >
                aredl.net
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        {list.error ? (
          <ErrorState
            title="Could not load the AREDL list"
            message={list.error}
            action={<Button onClick={list.reload}>Retry</Button>}
          />
        ) : list.initialLoading ? (
          <RowSkeletonList count={10} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="Nothing matches that"
            description="Try a level name, an AREDL position, or a Geometry Dash level ID."
          />
        ) : (
          <>
            <ol className="panel divide-y divide-ink-800/80 overflow-hidden">
              {filtered.slice(0, visible).map((entry) => {
                const localId = loggedByGdId.get(entry.gdLevelId)
                const podium = entry.position <= 3

                const inner = (
                  <>
                    <span
                      className={cn(
                        'w-12 shrink-0 text-center font-display text-base font-bold tabular-nums sm:w-16 sm:text-lg',
                        podium ? 'text-brand-400' : 'text-ink-600',
                      )}
                    >
                      #{entry.position}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-ink-100">{entry.name}</span>
                        {entry.status === 'Legacy' && <Badge tone="neutral">legacy</Badge>}
                        {entry.twoPlayer && <Badge tone="info">2p</Badge>}
                        {localId && <Badge tone="brand">logged here</Badge>}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[0.6875rem] text-ink-600">
                        ID {entry.gdLevelId}
                        {entry.gddlTier !== null && ` · GDDL ${entry.gddlTier}`}
                      </span>
                    </span>
                    <span className="hidden shrink-0 gap-1 sm:flex">
                      {entry.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} tone="neutral">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  </>
                )

                return (
                  <li key={entry.gdLevelId}>
                    {localId ? (
                      <Link
                        to={`/levels/${localId}`}
                        className="flex items-center gap-3 p-3 transition hover:bg-ink-850/70"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 p-3">{inner}</div>
                    )}
                  </li>
                )
              })}
            </ol>

            {visible < filtered.length && (
              <div className="flex justify-center">
                <Button variant="secondary" onClick={() => setVisible((value) => value + PAGE)}>
                  Show more
                  <span className="text-ink-400">({filtered.length - visible} left)</span>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  )
}
