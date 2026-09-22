/**
 * Admin tools.
 *
 * Deliberately small: the brief asks for the structure, not a full back office.
 * Nothing here grants privilege on its own - every call still goes through the
 * same RLS policies, which check `public.is_admin()`. Flipping someone's
 * `is_admin` flag is a SQL-editor operation by design (the column is not in the
 * grant list for `authenticated`, so it cannot be set from the app at all).
 */

import { describeError, requireSupabase } from '@/lib/supabase'
import type { ProfileRow, SyncRunRow } from '@/types/database'
import { cacheClear } from '@/lib/cache'
import { resetEdgeAvailability } from './edge'
import * as aredlService from './aredl.service'
import * as levelsService from './levels.service'
import * as gd from './geometryDash.service'

export async function listMembers(): Promise<ProfileRow[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export async function listSyncRuns(limit = 10): Promise<SyncRunRow[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('sync_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export interface AdminSyncOutcome {
  message: string
  serverSide: boolean
  levelsUpdated: number
}

/**
 * Forces an AREDL sync.
 *
 * With the Edge Function deployed this updates the shared mirror and every
 * catalogue row. Without it we fall back to re-applying ranks from the browser,
 * which works because `levels` is writable by signed-in users - slower, one
 * UPDATE per changed level, but it produces the same end state.
 */
export async function forceAredlSync(): Promise<AdminSyncOutcome> {
  const result = await aredlService.syncRankings()

  if (result.serverSide) {
    return {
      message: `${result.message} ${result.levelsUpdated} catalogue rows updated.`,
      serverSide: true,
      levelsUpdated: result.levelsUpdated,
    }
  }

  const updated = await levelsService.reapplyRanksLocally()
  return {
    message:
      `Synced from the browser: ${result.levelsSeen} AREDL entries read, ` +
      `${updated} catalogue rows updated. Deploy sync-aredl for a scheduled server-side sync.`,
    serverSide: false,
    levelsUpdated: updated,
  }
}

/** Re-reads Geometry Dash metadata for every catalogue level. */
export async function refreshAllLevelMetadata(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const client = requireSupabase()
  const { data, error } = await client.from('levels').select('gd_level_id')
  if (error) throw new Error(describeError(error))

  const ids = (data ?? []).map((row) => row.gd_level_id)
  let done = 0

  for (const gdLevelId of ids) {
    try {
      await levelsService.refreshLevel(gdLevelId)
    } catch {
      // One dead level must not abort the batch.
    }
    done += 1
    onProgress?.(done, ids.length)
  }

  return done
}

/** Deletes a level and, by cascade, every completion attached to it. */
export async function deleteLevel(levelId: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('levels').delete().eq('id', levelId)
  if (error) throw new Error(describeError(error))
}

/** Deletes any completion. Allowed for admins by the RLS delete policy. */
export async function deleteCompletion(completionId: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('completions').delete().eq('id', completionId)
  if (error) throw new Error(describeError(error))
}

export interface ProviderHealth {
  geometryDash: boolean
  aredl: boolean
  checkedAt: string
}

export async function checkProviders(): Promise<ProviderHealth> {
  const [geometryDash, aredl] = await Promise.all([
    gd.providerHealthy().catch(() => false),
    aredlService
      .getRankedLevels()
      .then((result) => result.entries.length > 0)
      .catch(() => false),
  ])

  return { geometryDash, aredl, checkedAt: new Date().toISOString() }
}

/** Drops every client-side cache and re-probes the Edge Functions. */
export function clearCaches(): void {
  cacheClear()
  resetEdgeAvailability()
}
