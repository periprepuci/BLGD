/**
 * Levels: resolving a Geometry Dash level id into everything we know about it,
 * and reading/writing the shared `levels` catalogue.
 *
 * "Resolving" means combining two independent sources - the Geometry Dash
 * provider (name, creator, difficulty) and AREDL (rank, points, credits,
 * verification video). Each half can fail on its own, and `ResolvedLevel.source`
 * records what actually happened so the UI can say "AREDL unreachable" instead
 * of quietly showing "Unranked".
 */

import { describeError, requireSupabase, supabase } from '@/lib/supabase'
import type { LevelRow, LevelStatsRow } from '@/types/database'
import type { LevelWithStats, ResolvedLevel } from '@/types/domain'
import { derivedThumbnailUrl } from '@/utils/thumbnails'
import * as aredl from './aredl.service'
import { invokeEdge } from './edge'
import * as gd from './geometryDash.service'

// ---------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------

interface EdgeResolvedLevel {
  level: LevelRow
  sources: { gd: ResolvedLevel['source']['gd']; aredl: ResolvedLevel['source']['aredl'] }
}

function fromRow(row: LevelRow, sources: ResolvedLevel['source']): ResolvedLevel {
  return {
    gdLevelId: row.gd_level_id,
    name: row.name,
    creator: row.creator,
    creators: row.creators ?? [],
    accountId: row.gd_account_id,
    playerId: row.gd_player_id,
    difficulty: row.difficulty,
    length: row.length,
    songName: row.song_name,
    downloads: row.downloads,
    likes: row.likes,
    description: row.description,
    isExtremeDemon: row.difficulty?.toLowerCase() === 'extreme demon',
    aredlId: row.aredl_id,
    aredlRank: row.aredl_rank,
    aredlStatus: row.aredl_status,
    aredlPoints: row.aredl_points,
    gddlTier: row.gddl_tier,
    tags: row.tags ?? [],
    verificationVideoUrl: row.verification_video_url,
    thumbnailUrl: row.thumbnail_url,
    source: sources,
  }
}

/**
 * Looks a level up across both providers.
 *
 * Prefers the `resolve-level` Edge Function, which does the same work
 * server-side and writes the catalogue row with the service_role key. Falls
 * back to calling both public APIs from the browser, which works because both
 * send permissive CORS headers.
 */
export async function resolveLevel(
  gdLevelId: number,
  signal?: AbortSignal,
): Promise<ResolvedLevel> {
  const viaEdge = await invokeEdge<EdgeResolvedLevel>('resolve-level', { gd_level_id: gdLevelId })
  if (viaEdge?.level) return fromRow(viaEdge.level, viaEdge.sources)

  // --- direct path ---------------------------------------------------------
  // The Geometry Dash half is required: without a name there is nothing to
  // show. The AREDL half is optional - plenty of Extreme Demons are not listed.
  const level = await gd.getLevel(gdLevelId, signal)

  let detail: Awaited<ReturnType<typeof aredl.getLevelDetail>> = null
  let aredlSource: ResolvedLevel['source']['aredl'] = 'direct'
  try {
    detail = await aredl.getLevelDetail(gdLevelId, { signal })
  } catch {
    aredlSource = 'unavailable'
  }

  const creators = detail?.creators?.length
    ? detail.creators
    : level.creator
      ? [level.creator]
      : []

  return {
    gdLevelId: level.gdLevelId,
    name: detail?.name || level.name,
    creator: level.creator ?? detail?.publisher ?? null,
    creators,
    accountId: level.accountId,
    playerId: level.playerId,
    difficulty: level.difficulty,
    length: level.length,
    songName: level.songName,
    downloads: level.downloads,
    likes: level.likes,
    description: level.description,
    isExtremeDemon: level.isExtremeDemon,

    aredlId: detail?.aredlId ?? null,
    aredlRank: detail?.position ?? null,
    aredlStatus:
      detail?.status === 'MainList' || detail?.status === 'Legacy' ? detail.status : null,
    aredlPoints: detail?.points ?? null,
    gddlTier: detail?.gddlTier ?? null,
    tags: detail?.tags ?? [],

    verificationVideoUrl: detail?.verificationVideoUrl ?? null,
    thumbnailUrl: derivedThumbnailUrl(detail?.verificationVideoUrl ?? null),

    source: { gd: 'direct', aredl: aredlSource },
  }
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/**
 * Inserts or refreshes the catalogue row for a resolved level and returns it.
 *
 * `onConflict: gd_level_id` is what enforces requirement 4: one row per level,
 * however many people complete it.
 */
export async function upsertLevel(resolved: ResolvedLevel): Promise<LevelRow> {
  const client = requireSupabase()
  const now = new Date().toISOString()

  const { data, error } = await client
    .from('levels')
    .upsert(
      {
        gd_level_id: resolved.gdLevelId,
        name: resolved.name,
        creator: resolved.creator,
        creators: resolved.creators,
        gd_account_id: resolved.accountId,
        gd_player_id: resolved.playerId,
        difficulty: resolved.difficulty,
        length: resolved.length,
        song_name: resolved.songName,
        downloads: resolved.downloads,
        likes: resolved.likes,
        description: resolved.description,
        aredl_id: resolved.aredlId,
        aredl_rank: resolved.aredlRank,
        aredl_status: resolved.aredlStatus,
        aredl_points: resolved.aredlPoints,
        gddl_tier: resolved.gddlTier,
        tags: resolved.tags,
        verification_video_url: resolved.verificationVideoUrl,
        thumbnail_url: resolved.thumbnailUrl,
        aredl_synced_at: resolved.source.aredl === 'unavailable' ? null : now,
        gd_synced_at: now,
      },
      { onConflict: 'gd_level_id' },
    )
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

/**
 * Aggregate stats for a set of levels.
 *
 * Fetched separately rather than as a PostgREST embed: `level_stats` is a
 * grouped view whose `level_id` maps to `levels.id`, a primary key rather than
 * a foreign key, so PostgREST has no relationship to infer and an embed would
 * fail at runtime. One extra indexed query is the honest fix.
 */
async function fetchStats(levelIds: string[]): Promise<Map<string, LevelStatsRow>> {
  if (levelIds.length === 0) return new Map()
  const client = requireSupabase()

  const { data, error } = await client.from('level_stats').select('*').in('level_id', levelIds)
  if (error) throw new Error(describeError(error))

  return new Map((data ?? []).map((row) => [row.level_id, row]))
}

function merge(level: LevelRow, stats: LevelStatsRow | undefined): LevelWithStats {
  return {
    ...level,
    completions_count: stats?.completions_count ?? 0,
    avg_enjoyment: stats?.avg_enjoyment ?? null,
    avg_difficulty: stats?.avg_difficulty ?? null,
  }
}

export async function getLevelById(id: string): Promise<LevelWithStats | null> {
  const client = requireSupabase()

  const { data, error } = await client.from('levels').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(describeError(error))
  if (!data) return null

  const stats = await fetchStats([data.id])
  return merge(data, stats.get(data.id))
}

export async function getLevelByGdId(gdLevelId: number): Promise<LevelRow | null> {
  const client = requireSupabase()

  const { data, error } = await client
    .from('levels')
    .select('*')
    .eq('gd_level_id', gdLevelId)
    .maybeSingle()

  if (error) throw new Error(describeError(error))
  return data
}

export interface ListLevelsOptions {
  search?: string
  page?: number
  pageSize?: number
  sort?: 'aredl_rank' | 'name' | 'created_at'
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/** Levels that at least one member has logged, with aggregate stats. */
export async function listLevels({
  search = '',
  page = 0,
  pageSize = 24,
  sort = 'aredl_rank',
}: ListLevelsOptions = {}): Promise<Paged<LevelWithStats>> {
  const client = requireSupabase()

  let query = client.from('levels').select('*', { count: 'exact' })

  const term = search.trim()
  if (term) {
    // `or` takes a PostgREST filter string, so the term must not contain the
    // characters that delimit it. Stripping them keeps the filter well-formed
    // and stops a crafted search from changing its meaning.
    const safe = term.replace(/[,()*\\."']/g, ' ').trim()
    if (safe) {
      const clauses = [`name.ilike.*${safe}*`, `creator.ilike.*${safe}*`]
      if (/^\d+$/.test(safe)) clauses.push(`gd_level_id.eq.${safe}`)
      query = query.or(clauses.join(','))
    }
  }

  switch (sort) {
    case 'name':
      query = query.order('name', { ascending: true })
      break
    case 'created_at':
      query = query.order('created_at', { ascending: false })
      break
    default:
      query = query.order('aredl_rank', { ascending: true, nullsFirst: false })
  }

  const from = page * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw new Error(describeError(error))

  const rows = data ?? []
  const stats = await fetchStats(rows.map((row) => row.id))
  const items = rows.map((row) => merge(row, stats.get(row.id)))
  const total = count ?? items.length

  return { items, total, page, pageSize, hasMore: from + items.length < total }
}

/**
 * Re-reads both providers for one level and writes the result back. Used by the
 * "refresh" button on the level page and by the admin tools.
 */
export async function refreshLevel(gdLevelId: number): Promise<LevelRow> {
  const resolved = await resolveLevel(gdLevelId)
  return upsertLevel(resolved)
}

/**
 * Re-stamps AREDL ranks for every catalogue row from the current ranking.
 *
 * This is the client-side equivalent of the `sync-aredl` Edge Function, used
 * when that function is not deployed. It only touches AREDL columns, and only
 * rows whose rank actually moved.
 */
export async function reapplyRanksLocally(): Promise<number> {
  if (!supabase) return 0

  const [{ data: levels, error }, index] = await Promise.all([
    supabase.from('levels').select('id, gd_level_id, aredl_rank'),
    aredl.getRankIndex({ force: true }),
  ])

  if (error) throw new Error(describeError(error))

  const now = new Date().toISOString()
  const changed = (levels ?? []).filter(
    (level) => (index.get(level.gd_level_id)?.position ?? null) !== level.aredl_rank,
  )

  for (const level of changed) {
    const entry = index.get(level.gd_level_id)
    const { error: updateError } = await supabase
      .from('levels')
      .update({
        aredl_rank: entry?.position ?? null,
        aredl_status:
          entry?.status === 'MainList' || entry?.status === 'Legacy' ? entry.status : null,
        aredl_points: entry?.points ?? null,
        gddl_tier: entry?.gddlTier ?? null,
        aredl_synced_at: now,
      })
      .eq('id', level.id)

    if (updateError) throw new Error(describeError(updateError))
  }

  return changed.length
}

/**
 * Minimal `gd_level_id -> levels.id` map.
 *
 * Used by the AREDL page to mark which listed levels the group has already
 * logged. Selecting two columns keeps it cheap even once the catalogue is large
 * - fetching whole rows plus their stats for the same job would not be.
 */
export async function getLoggedLevelIndex(): Promise<Map<number, string>> {
  const client = requireSupabase()

  const { data, error } = await client.from('levels').select('id, gd_level_id')
  if (error) throw new Error(describeError(error))

  return new Map((data ?? []).map((row) => [row.gd_level_id, row.id]))
}
