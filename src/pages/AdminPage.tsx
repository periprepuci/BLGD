import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Database,
  RefreshCw,
  Server,
  Trash2,
  Users,
  Zap,
} from 'lucide-react'

import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { RowSkeletonList } from '@/components/ui/Skeleton'
import { StatTile } from '@/components/ui/StatTile'
import { Page, Section } from '@/components/layout/Page'
import { useAction, useAsync } from '@/hooks/useAsync'
import { useToast } from '@/hooks/useToast'
import { useAppContext } from '@/layouts/AppLayout'
import * as adminService from '@/services/admin.service'
import * as completionsService from '@/services/completions.service'
import * as levelsService from '@/services/levels.service'
import { avatarUrl, displayNameOf } from '@/services/profiles.service'
import type { LevelWithStats } from '@/types/domain'
import { formatDate, formatNumber, formatRelative } from '@/utils/format'

export function AdminPage() {
  const toast = useToast()
  const { dataVersion, bumpDataVersion } = useAppContext()

  const [progress, setProgress] = useState<string | null>(null)
  const [pendingLevelDelete, setPendingLevelDelete] = useState<LevelWithStats | null>(null)

  const members = useAsync(() => adminService.listMembers(), [dataVersion])
  const levels = useAsync(() => levelsService.listLevels({ pageSize: 50, sort: 'created_at' }), [dataVersion])
  const totalCompletions = useAsync(() => completionsService.countCompletions(), [dataVersion])
  const runs = useAsync(() => adminService.listSyncRuns(8), [dataVersion])
  const health = useAsync(() => adminService.checkProviders(), [])

  const syncAredl = useAction(async () => adminService.forceAredlSync())

  const refreshLevels = useAction(async () => {
    const done = await adminService.refreshAllLevelMetadata((current, total) =>
      setProgress(`${current} / ${total}`),
    )
    setProgress(null)
    return done
  })

  const deleteLevel = useAction(async (level: LevelWithStats) => {
    await adminService.deleteLevel(level.id)
    return level
  })

  const onSyncAredl = async () => {
    const result = await syncAredl.run()
    if (result) toast.success('AREDL sync finished', result.message)
    else if (syncAredl.error) toast.error('Sync failed', syncAredl.error)
    bumpDataVersion()
  }

  const onRefreshLevels = async () => {
    const done = await refreshLevels.run()
    if (done !== null) toast.success('Level metadata refreshed', `${done} levels re-read.`)
    else if (refreshLevels.error) toast.error('Refresh failed', refreshLevels.error)
    bumpDataVersion()
  }

  const onDeleteLevel = async () => {
    if (!pendingLevelDelete) return
    const removed = await deleteLevel.run(pendingLevelDelete)
    setPendingLevelDelete(null)
    if (!removed) {
      if (deleteLevel.error) toast.error('Could not delete', deleteLevel.error)
      return
    }
    toast.success('Level deleted', `${removed.name} and its completions were removed.`)
    bumpDataVersion()
  }

  return (
    <Page
      title="Admin"
      description="Force a sync, re-read external data, and remove content. Everything here still runs through the same RLS policies as everyone else."
    >
      <div className="space-y-10">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Members" value={members.data?.length ?? '—'} icon={Users} tone="brand" />
          <StatTile label="Levels" value={levels.data?.total ?? '—'} icon={Database} />
          <StatTile label="Completions" value={totalCompletions.data ?? '—'} icon={Activity} />
          <StatTile
            label="Providers"
            value={
              health.data ? (
                <span className="flex items-center gap-2 text-lg">
                  <Badge tone={health.data.geometryDash ? 'success' : 'danger'}>GD</Badge>
                  <Badge tone={health.data.aredl ? 'success' : 'danger'}>AREDL</Badge>
                </span>
              ) : (
                '…'
              )
            }
            detail={health.data ? `checked ${formatRelative(health.data.checkedAt)}` : undefined}
            icon={Server}
          />
        </div>

        <Section title="Data synchronisation">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel space-y-3 p-5">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-100">
                <Zap className="h-4 w-4 text-brand-400" aria-hidden="true" />
                AREDL ranking
              </h3>
              <p className="text-sm leading-relaxed text-ink-400">
                Pulls the current list and re-stamps <code className="text-ink-300">aredl_rank</code>{' '}
                on every catalogue level. With the <code className="text-ink-300">sync-aredl</code>{' '}
                Edge Function deployed this runs server-side and updates the shared mirror; without
                it, the same work happens from this browser.
              </p>
              <Button onClick={onSyncAredl} loading={syncAredl.pending}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Sync AREDL now
              </Button>
            </div>

            <div className="panel space-y-3 p-5">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-100">
                <Database className="h-4 w-4 text-brand-400" aria-hidden="true" />
                Level metadata
              </h3>
              <p className="text-sm leading-relaxed text-ink-400">
                Re-reads name, creator, difficulty and artwork for every level from Geometry Dash
                and AREDL. One request per level, so it is slow on a large catalogue.
              </p>
              <Button variant="secondary" onClick={onRefreshLevels} loading={refreshLevels.pending}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Refresh all levels
                {progress && <span className="text-ink-400">{progress}</span>}
              </Button>
            </div>
          </div>

          {runs.data && runs.data.length > 0 && (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-left">
                    <th className="stat-label p-3">When</th>
                    <th className="stat-label p-3">Kind</th>
                    <th className="stat-label p-3">Status</th>
                    <th className="stat-label p-3 text-right">Seen</th>
                    <th className="stat-label p-3 text-right">Updated</th>
                    <th className="stat-label p-3 text-right">Took</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800/70">
                  {runs.data.map((run) => (
                    <tr key={run.id}>
                      <td className="p-3 text-ink-300">{formatRelative(run.created_at)}</td>
                      <td className="p-3 font-mono text-xs text-ink-400">{run.kind}</td>
                      <td className="p-3">
                        <Badge tone={run.status === 'ok' ? 'success' : 'danger'}>{run.status}</Badge>
                      </td>
                      <td className="p-3 text-right tabular-nums text-ink-300">
                        {formatNumber(run.levels_seen)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-ink-300">
                        {formatNumber(run.levels_updated)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-ink-500">
                        {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                adminService.clearCaches()
                toast.success('Caches cleared', 'Next request goes straight to the source.')
                bumpDataVersion()
              }}
            >
              Clear local caches
            </Button>
            <Button variant="ghost" size="sm" onClick={health.reload} loading={health.loading}>
              Re-check providers
            </Button>
          </div>
        </Section>

        <Section title="Members">
          {members.initialLoading ? (
            <RowSkeletonList count={4} />
          ) : (
            <ul className="panel divide-y divide-ink-800/80 overflow-hidden">
              {(members.data ?? []).map((member) => (
                <li key={member.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Avatar src={avatarUrl(member)} name={displayNameOf(member)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink-100">
                      <Link
                        to={`/profile/${member.username}`}
                        className="truncate transition hover:text-brand-400"
                      >
                        {displayNameOf(member)}
                      </Link>
                      {member.is_admin && <Badge tone="brand">admin</Badge>}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      @{member.username}
                      {member.gd_username && ` · GD ${member.gd_username}`}
                      {member.gd_stars !== null && ` · ${formatNumber(member.gd_stars)} stars`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-600">
                    joined {formatDate(member.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-500">
            Admin rights are granted in SQL, not here — the <code>is_admin</code> column is outside
            the column grant for signed-in users, so no session can raise its own privileges.
          </p>
        </Section>

        <Section title="Levels">
          {levels.initialLoading ? (
            <RowSkeletonList count={4} />
          ) : (
            <ul className="panel divide-y divide-ink-800/80 overflow-hidden">
              {(levels.data?.items ?? []).map((level) => (
                <li key={level.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-100">
                      <Link to={`/levels/${level.id}`} className="transition hover:text-brand-400">
                        {level.name}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {level.creator ?? 'Unknown'} · ID {level.gd_level_id} ·{' '}
                      {level.aredl_rank ? `AREDL #${level.aredl_rank}` : 'unranked'} ·{' '}
                      {level.completions_count} completions
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingLevelDelete(level)}
                    aria-label={`Delete ${level.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <ConfirmDialog
        open={pendingLevelDelete !== null}
        title="Delete this level?"
        message={
          pendingLevelDelete
            ? `${pendingLevelDelete.name} will be removed from the catalogue, along with all ${pendingLevelDelete.completions_count} completions logged against it. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete level"
        destructive
        pending={deleteLevel.pending}
        onConfirm={onDeleteLevel}
        onCancel={() => setPendingLevelDelete(null)}
      />
    </Page>
  )
}
