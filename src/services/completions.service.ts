/**
 * Completions: the personal half of the data model.
 *
 * Every write here is scoped to the signed-in user by RLS, so the service layer
 * does not need to filter by user on writes - and cannot bypass it if it tried.
 * What it does do is validate before the round trip so people get a sentence
 * instead of a constraint-violation code.
 */

import { describeError, requireSupabase } from '@/lib/supabase'
import type { CompletionRow, CompletionUpdate, LevelRow, ProfileRow } from '@/types/database'
import type {
  CompletionSortKey,
  CompletionWithLevel,
  CompletionWithLevelAndProfile,
  CompletionWithProfile,
  SortDirection,
} from '@/types/domain'
import { extractYouTubeId, watchUrl } from '@/utils/youtube'
import {
  clampRating,
  firstError,
  sanitizeText,
  validateCompletedAt,
  validateRating,
  validateYouTubeUrl,
} from '@/utils/validation'

const LEVEL_COLUMNS =
  'id, gd_level_id, name, creator, creators, gd_account_id, gd_player_id, difficulty, length, ' +
  'song_name, downloads, likes, aredl_id, aredl_rank, aredl_status, aredl_points, gddl_tier, ' +
  'tags, description, verification_video_url, thumbnail_url, aredl_synced_at, gd_synced_at, ' +
  'created_at, updated_at'

const PROFILE_COLUMNS = 'id, username, display_name, gd_username, gd_account_id, gd_icon'

type LevelJoin = LevelRow | LevelRow[] | null
type ProfileJoin = CompletionWithProfile['profile'] | CompletionWithProfile['profile'][] | null

/** PostgREST returns an embed as an object or a single-element array. */
function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CompletionInput {
  levelId: string
  enjoyment: number
  difficulty: number
  youtubeUrl: string
  completedAt: string
  note?: string
}

function validate(input: CompletionInput): void {
  const message = firstError(
    validateRating(input.enjoyment),
    validateRating(input.difficulty),
    validateYouTubeUrl(input.youtubeUrl),
    validateCompletedAt(input.completedAt),
  )
  if (message) throw new Error(message)
}

/**
 * Normalises the YouTube link.
 *
 * The stored URL is rebuilt from the extracted video id rather than echoed
 * back, so whatever ends up in an `href` is a canonical youtube.com/watch URL
 * and nothing else - tracking parameters and anything exotic are dropped.
 */
function normaliseVideo(url: string): { youtube_url: string | null; youtube_video_id: string | null } {
  const videoId = extractYouTubeId(url)
  return { youtube_url: watchUrl(videoId), youtube_video_id: videoId }
}

export async function addCompletion(
  userId: string,
  input: CompletionInput,
): Promise<CompletionRow> {
  validate(input)
  const client = requireSupabase()

  const { data, error } = await client
    .from('completions')
    .insert({
      user_id: userId,
      level_id: input.levelId,
      enjoyment: clampRating(input.enjoyment),
      difficulty: clampRating(input.difficulty),
      completed_at: input.completedAt,
      note: input.note ? sanitizeText(input.note, 500) || null : null,
      ...normaliseVideo(input.youtubeUrl),
    })
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export interface CompletionPatch {
  enjoyment?: number
  difficulty?: number
  youtubeUrl?: string
  completedAt?: string
  note?: string | null
}

export async function updateCompletion(
  completionId: string,
  patch: CompletionPatch,
): Promise<CompletionRow> {
  const client = requireSupabase()
  const update: CompletionUpdate = {}

  if (patch.enjoyment !== undefined) {
    const check = validateRating(patch.enjoyment)
    if (!check.ok) throw new Error(check.message)
    update.enjoyment = clampRating(patch.enjoyment)
  }
  if (patch.difficulty !== undefined) {
    const check = validateRating(patch.difficulty)
    if (!check.ok) throw new Error(check.message)
    update.difficulty = clampRating(patch.difficulty)
  }
  if (patch.completedAt !== undefined) {
    const check = validateCompletedAt(patch.completedAt)
    if (!check.ok) throw new Error(check.message)
    update.completed_at = patch.completedAt
  }
  if (patch.youtubeUrl !== undefined) {
    const check = validateYouTubeUrl(patch.youtubeUrl)
    if (!check.ok) throw new Error(check.message)
    Object.assign(update, normaliseVideo(patch.youtubeUrl))
  }
  if (patch.note !== undefined) {
    update.note = patch.note ? sanitizeText(patch.note, 500) || null : null
  }

  if (Object.keys(update).length === 0) {
    throw new Error('Nothing to update.')
  }

  // No `.eq('user_id', …)` needed: the RLS policy restricts the statement to
  // rows owned by auth.uid(). Attempting someone else's row updates nothing.
  const { data, error } = await client
    .from('completions')
    .update(update)
    .eq('id', completionId)
    .select()
    .maybeSingle()

  if (error) throw new Error(describeError(error))
  if (!data) throw new Error('That completion is not yours to edit.')
  return data
}

export async function deleteCompletion(completionId: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('completions').delete().eq('id', completionId)
  if (error) throw new Error(describeError(error))
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type CompletionWithLevelRaw = CompletionRow & { levels: LevelJoin }

function toWithLevel(row: CompletionWithLevelRaw): CompletionWithLevel | null {
  const level = one(row.levels)
  if (!level) return null
  const { levels: _drop, ...completion } = row
  return { ...completion, level }
}

export async function listUserCompletions(userId: string): Promise<CompletionWithLevel[]> {
  const client = requireSupabase()

  const { data, error } = await client
    .from('completions')
    .select(`*, levels!inner(${LEVEL_COLUMNS})`)
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })

  if (error) throw new Error(describeError(error))

  return ((data ?? []) as unknown as CompletionWithLevelRaw[])
    .map(toWithLevel)
    .filter((row): row is CompletionWithLevel => row !== null)
}

export async function getUserCompletionForLevel(
  userId: string,
  levelId: string,
): Promise<CompletionRow | null> {
  const client = requireSupabase()

  const { data, error } = await client
    .from('completions')
    .select('*')
    .eq('user_id', userId)
    .eq('level_id', levelId)
    .maybeSingle()

  if (error) throw new Error(describeError(error))
  return data
}

type CompletionWithProfileRaw = CompletionRow & { profiles: ProfileJoin }

/** Everyone who has logged a given level - the "community completions" list. */
export async function listLevelCompletions(levelId: string): Promise<CompletionWithProfile[]> {
  const client = requireSupabase()

  const { data, error } = await client
    .from('completions')
    .select(`*, profiles!inner(${PROFILE_COLUMNS})`)
    .eq('level_id', levelId)
    .order('completed_at', { ascending: false })

  if (error) throw new Error(describeError(error))

  return ((data ?? []) as unknown as CompletionWithProfileRaw[])
    .map((row) => {
      const profile = one(row.profiles)
      if (!profile) return null
      const { profiles: _drop, ...completion } = row
      return { ...completion, profile }
    })
    .filter((row): row is CompletionWithProfile => row !== null)
}

type CompletionFullRaw = CompletionRow & { levels: LevelJoin; profiles: ProfileJoin }

/** The activity feed on the home page and dashboard. */
export async function listRecentCompletions(
  limit = 8,
): Promise<CompletionWithLevelAndProfile[]> {
  const client = requireSupabase()

  const { data, error } = await client
    .from('completions')
    .select(`*, levels!inner(${LEVEL_COLUMNS}), profiles!inner(${PROFILE_COLUMNS})`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(describeError(error))

  return ((data ?? []) as unknown as CompletionFullRaw[])
    .map((row) => {
      const level = one(row.levels)
      const profile = one(row.profiles)
      if (!level || !profile) return null
      const { levels: _l, profiles: _p, ...completion } = row
      return { ...completion, level, profile }
    })
    .filter((row): row is CompletionWithLevelAndProfile => row !== null)
}

export async function countCompletions(): Promise<number> {
  const client = requireSupabase()
  const { count, error } = await client
    .from('completions')
    .select('id', { count: 'exact', head: true })

  if (error) throw new Error(describeError(error))
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Sorting (client side - the lists are per-user and small)
// ---------------------------------------------------------------------------

const NULL_LAST = Number.POSITIVE_INFINITY

function sortValue(item: CompletionWithLevel, key: CompletionSortKey): number | string {
  switch (key) {
    case 'aredl_rank':
      return item.level.aredl_rank ?? NULL_LAST
    case 'enjoyment':
      return item.enjoyment ?? -1
    case 'difficulty':
      return item.difficulty ?? -1
    case 'name':
      return item.level.name.toLowerCase()
    case 'completed_at':
    default:
      return new Date(item.completed_at).getTime()
  }
}

export function sortCompletions<T extends CompletionWithLevel>(
  items: T[],
  key: CompletionSortKey,
  direction: SortDirection,
): T[] {
  const factor = direction === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    const left = sortValue(a, key)
    const right = sortValue(b, key)

    if (typeof left === 'string' || typeof right === 'string') {
      return String(left).localeCompare(String(right)) * factor
    }
    if (left === right) return a.level.name.localeCompare(b.level.name)
    return (left < right ? -1 : 1) * factor
  })
}

/** Aggregates used by the profile header, computed from rows we already have. */
export function summarise(items: CompletionWithLevel[]) {
  const enjoyment = items.map((i) => i.enjoyment).filter((v): v is number => v !== null)
  const difficulty = items.map((i) => i.difficulty).filter((v): v is number => v !== null)
  const ranked = items.map((i) => i.level.aredl_rank).filter((v): v is number => v !== null)

  const mean = (values: number[]) =>
    values.length === 0
      ? null
      : Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100

  return {
    total: items.length,
    avgEnjoyment: mean(enjoyment),
    avgDifficulty: mean(difficulty),
    bestRank: ranked.length ? Math.min(...ranked) : null,
    withVideo: items.filter((i) => i.youtube_video_id).length,
  }
}

export type { ProfileRow }
