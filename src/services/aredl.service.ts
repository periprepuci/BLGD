/**
 * AREDL (All Rated Extreme Demons List) data provider.
 *
 * AREDL publishes a documented, public, CORS-enabled REST API at
 * https://api.aredl.net/v2 (docs: https://api.aredl.net/v2/docs, OpenAPI at
 * https://api.aredl.net/v2/openapi.json). No key, no auth for reads. The
 * endpoints this app uses:
 *
 *   GET /api/aredl/levels                  -> the whole ranking (~1.6k entries)
 *   GET /api/aredl/levels/:id              -> one level
 *   GET /api/aredl/levels/:id/creators     -> full credit list
 *
 * IMPORTANT - a real quirk of that API: `/levels/:id` resolves `:id` as an
 * AREDL uuid **or** a list position **or** a Geometry Dash level id. Asking for
 * `/levels/128` returns the level sitting at position 128, not the level whose
 * Geometry Dash id is 128. Anything that must be keyed on a Geometry Dash id
 * therefore matches against the `level_id` field of the full list, and per-level
 * calls are made with the unambiguous AREDL uuid. Ranks in this app are never
 * derived from that path parameter.
 *
 * Read order:
 *   1. `aredl_levels` in Supabase - our mirror, refreshed by the `sync-aredl`
 *      Edge Function. One shared fetch for the whole group.
 *   2. The AREDL API directly, cached in localStorage for 30 minutes.
 */

import { cached, cacheDelete, TTL } from '@/lib/cache'
import { env } from '@/lib/env'
import { getJson, isNotFound } from '@/lib/http'
import { supabase } from '@/lib/supabase'
import type { AredlLevelRow } from '@/types/database'
import type { AredlEntry, AredlLevelDetail } from '@/types/domain'
import { invokeEdge } from './edge'

const BASE = env.aredlApiBase

// --- raw API shapes ---------------------------------------------------------

interface RawAredlLevel {
  id?: string
  name?: string
  position?: number
  level_id?: number
  status?: string
  points?: number
  gddl_tier?: number | null
  two_player?: boolean
  tags?: string[]
  description?: string | null
}

interface RawAredlPerson {
  id?: string
  username?: string
  global_name?: string | null
}

interface RawAredlLevelDetail extends RawAredlLevel {
  publisher?: RawAredlPerson
  verifications?: Array<{ video_url?: string; hide_video?: boolean }>
}

function personName(person: RawAredlPerson | undefined): string | null {
  return person?.global_name?.trim() || person?.username?.trim() || null
}

function parseEntry(raw: RawAredlLevel): AredlEntry | null {
  if (typeof raw?.level_id !== 'number' || typeof raw.position !== 'number') return null
  return {
    gdLevelId: raw.level_id,
    aredlId: raw.id ?? null,
    name: raw.name?.trim() || `Level ${raw.level_id}`,
    position: raw.position,
    status: raw.status ?? null,
    points: typeof raw.points === 'number' ? raw.points : null,
    gddlTier: typeof raw.gddl_tier === 'number' ? raw.gddl_tier : null,
    twoPlayer: Boolean(raw.two_player),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    description: raw.description?.trim() || null,
  }
}

function fromMirrorRow(row: AredlLevelRow): AredlEntry {
  return {
    gdLevelId: row.gd_level_id,
    aredlId: row.aredl_id,
    name: row.name,
    position: row.position,
    status: row.status,
    points: row.points,
    gddlTier: row.gddl_tier,
    twoPlayer: row.two_player,
    tags: row.tags ?? [],
    description: row.description,
  }
}

// --- the list ---------------------------------------------------------------

export interface RankedLevelsResult {
  entries: AredlEntry[]
  source: 'mirror' | 'direct'
  syncedAt: string | null
}

async function fetchFromMirror(): Promise<RankedLevelsResult | null> {
  if (!supabase) return null

  // Supabase caps a single request at 1000 rows; the list is larger.
  const pageSize = 1000
  const entries: AredlEntry[] = []
  let from = 0
  let syncedAt: string | null = null

  for (;;) {
    const { data, error } = await supabase
      .from('aredl_levels')
      .select('*')
      .order('position', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) return null
    if (!data || data.length === 0) break

    for (const row of data) {
      entries.push(fromMirrorRow(row))
      if (!syncedAt || row.synced_at > syncedAt) syncedAt = row.synced_at
    }

    if (data.length < pageSize) break
    from += pageSize
  }

  return entries.length > 0 ? { entries, source: 'mirror', syncedAt } : null
}

async function fetchFromApi(signal?: AbortSignal): Promise<RankedLevelsResult> {
  const raw = await getJson<RawAredlLevel[]>(`${BASE}/api/aredl/levels`, {
    signal,
    timeoutMs: 30_000,
  })
  const entries = (Array.isArray(raw) ? raw : [])
    .map(parseEntry)
    .filter((entry): entry is AredlEntry => entry !== null)
    .sort((a, b) => a.position - b.position)

  return { entries, source: 'direct', syncedAt: new Date().toISOString() }
}

const LIST_KEY = 'aredl.list'

/** The full AREDL ranking, mirror first, API second. */
export async function getRankedLevels(
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<RankedLevelsResult> {
  if (options.force) cacheDelete(LIST_KEY)

  return cached(LIST_KEY, { ttl: TTL.aredlList, persist: true }, async () => {
    const mirrored = await fetchFromMirror()
    if (mirrored) return mirrored
    return fetchFromApi(options.signal)
  })
}

/** Index by Geometry Dash level id - the only safe key for rank lookups. */
export async function getRankIndex(
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<Map<number, AredlEntry>> {
  const { entries } = await getRankedLevels(options)
  return new Map(entries.map((entry) => [entry.gdLevelId, entry]))
}

/** Current AREDL entry for a Geometry Dash level, or null when not listed. */
export async function getEntryForLevel(
  gdLevelId: number,
  options: { signal?: AbortSignal } = {},
): Promise<AredlEntry | null> {
  const index = await getRankIndex(options)
  return index.get(gdLevelId) ?? null
}

/** Convenience: just the position. */
export async function getLevelRank(gdLevelId: number): Promise<number | null> {
  return (await getEntryForLevel(gdLevelId))?.position ?? null
}

// --- per-level detail -------------------------------------------------------

/**
 * Full detail for one level: credits and the verification video, which is where
 * the level artwork comes from.
 *
 * Resolved via the AREDL uuid whenever we have it, precisely because the path
 * parameter is ambiguous (see the module comment). When the level is not on the
 * list at all this returns null rather than guessing.
 */
export async function getLevelDetail(
  gdLevelId: number,
  options: { signal?: AbortSignal } = {},
): Promise<AredlLevelDetail | null> {
  const entry = await getEntryForLevel(gdLevelId, options)
  if (!entry) return null

  return cached(`aredl.detail.${gdLevelId}`, { ttl: TTL.aredlLevel, persist: true }, async () => {
    const key = entry.aredlId ?? String(entry.gdLevelId)

    try {
      const [detail, creators] = await Promise.all([
        getJson<RawAredlLevelDetail>(`${BASE}/api/aredl/levels/${key}`, { signal: options.signal }),
        getJson<RawAredlPerson[]>(`${BASE}/api/aredl/levels/${key}/creators`, {
          signal: options.signal,
        }).catch(() => [] as RawAredlPerson[]),
      ])

      // Guard against the ambiguous path parameter resolving to a different
      // level: if the answer is not about the level we asked for, drop it.
      if (typeof detail.level_id === 'number' && detail.level_id !== gdLevelId) {
        return { ...entry, creators: [], publisher: null, verificationVideoUrl: null }
      }

      const visible = (detail.verifications ?? []).find((v) => v.video_url && !v.hide_video)

      return {
        ...(parseEntry(detail) ?? entry),
        creators: creators
          .map(personName)
          .filter((name): name is string => Boolean(name)),
        publisher: personName(detail.publisher),
        verificationVideoUrl: visible?.video_url ?? null,
      }
    } catch (error) {
      if (isNotFound(error)) {
        return { ...entry, creators: [], publisher: null, verificationVideoUrl: null }
      }
      throw error
    }
  })
}

// --- syncing ----------------------------------------------------------------

export interface SyncResult {
  ok: boolean
  levelsSeen: number
  levelsUpdated: number
  message: string
  /** True when the sync ran server-side; false when only the local cache was refreshed. */
  serverSide: boolean
}

/**
 * Refreshes the ranking.
 *
 * With the `sync-aredl` Edge Function deployed this rewrites the shared mirror
 * and re-stamps `levels.aredl_rank` for every level anyone has logged - that is
 * what keeps a level that moved from #27 to #31 correct for everybody.
 *
 * Without it, we can only drop this browser's cache, because writing the mirror
 * needs the service_role key and that key must never reach the frontend.
 */
export async function syncRankings(): Promise<SyncResult> {
  const result = await invokeEdge<{
    ok: boolean
    levels_seen: number
    levels_updated: number
    message?: string
  }>('sync-aredl')

  cacheDelete(LIST_KEY)

  if (result) {
    return {
      ok: result.ok,
      levelsSeen: result.levels_seen ?? 0,
      levelsUpdated: result.levels_updated ?? 0,
      message: result.message ?? 'AREDL ranking synced.',
      serverSide: true,
    }
  }

  const { entries } = await getRankedLevels({ force: true })
  return {
    ok: true,
    levelsSeen: entries.length,
    levelsUpdated: 0,
    message:
      'Local cache refreshed. Deploy the sync-aredl Edge Function to update the ' +
      'shared ranking for everyone.',
    serverSide: false,
  }
}
