/**
 * Server-side copies of the two external data providers.
 *
 * Deliberately a mirror of `src/services/aredl.service.ts` and
 * `src/services/geometryDash.service.ts`: the frontend and the Edge Functions
 * are deployed separately (GitHub Pages vs Supabase), so they cannot share a
 * module. Both halves use exactly the same endpoints, and both resolve AREDL
 * ranks by matching `level_id` against the full list rather than trusting the
 * ambiguous `/levels/:id` path parameter - see the note in the service.
 */

import { getJson, HttpError, isNotFound, toInt } from './http.ts'

export const AREDL_BASE = Deno.env.get('AREDL_API_BASE') ?? 'https://api.aredl.net/v2'
export const GD_BASE = Deno.env.get('GD_API_BASE') ?? 'https://gdbrowser.com'

// --- AREDL ------------------------------------------------------------------

export interface AredlRawLevel {
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

export interface AredlPerson {
  id?: string
  username?: string
  global_name?: string | null
}

export interface AredlDetail extends AredlRawLevel {
  publisher?: AredlPerson
  verifications?: Array<{ video_url?: string; hide_video?: boolean }>
}

export function personName(person: AredlPerson | undefined): string | null {
  return person?.global_name?.trim() || person?.username?.trim() || null
}

/** The entire AREDL ranking. ~1600 entries, ~850 KB. */
export async function fetchAredlList(): Promise<AredlRawLevel[]> {
  const raw = await getJson<AredlRawLevel[]>(`${AREDL_BASE}/api/aredl/levels`, 45_000)
  return Array.isArray(raw) ? raw.filter((entry) => typeof entry?.level_id === 'number') : []
}

/**
 * Per-level detail, looked up by AREDL uuid so the result is unambiguous.
 * Returns null when the level is not on the list.
 */
export async function fetchAredlDetail(
  aredlId: string,
  expectedGdLevelId: number,
): Promise<{ detail: AredlDetail; creators: string[] } | null> {
  try {
    const [detail, people] = await Promise.all([
      getJson<AredlDetail>(`${AREDL_BASE}/api/aredl/levels/${aredlId}`),
      getJson<AredlPerson[]>(`${AREDL_BASE}/api/aredl/levels/${aredlId}/creators`).catch(
        () => [] as AredlPerson[],
      ),
    ])

    // Guard against the path parameter resolving to a different level.
    if (typeof detail.level_id === 'number' && detail.level_id !== expectedGdLevelId) return null

    return {
      detail,
      creators: people.map(personName).filter((name): name is string => Boolean(name)),
    }
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export function visibleVerificationVideo(detail: AredlDetail): string | null {
  const entry = (detail.verifications ?? []).find((v) => v.video_url && !v.hide_video)
  return entry?.video_url ?? null
}

// --- Geometry Dash ----------------------------------------------------------

export interface GdRawLevel {
  name?: string
  id?: string | number
  description?: string
  author?: string
  playerID?: string | number
  accountID?: string | number
  difficulty?: string
  length?: string
  downloads?: number
  likes?: number
  songName?: string
}

export interface GdRawProfile {
  username?: string
  playerID?: string | number
  accountID?: string | number
  stars?: number
  moons?: number
  diamonds?: number
  demons?: number
  icon?: number
  ship?: number
  ball?: number
  ufo?: number
  wave?: number
  robot?: number
  spider?: number
  swing?: number
  col1?: number
  col2?: number
  colG?: number
  glow?: boolean
  classicDemonsCompleted?: { extreme?: number }
}

export async function fetchGdLevel(gdLevelId: number): Promise<GdRawLevel> {
  const raw = await getJson<GdRawLevel>(`${GD_BASE}/api/level/${gdLevelId}`)
  if (!raw?.name) throw new HttpError(`No Geometry Dash level with ID ${gdLevelId}`, 404)
  return raw
}

export async function fetchGdProfile(username: string): Promise<GdRawProfile> {
  const raw = await getJson<GdRawProfile>(`${GD_BASE}/api/profile/${encodeURIComponent(username)}`)
  if (!raw?.username) throw new HttpError(`No Geometry Dash player called "${username}"`, 404)
  return raw
}

export function gdIconPayload(raw: GdRawProfile): Record<string, number | boolean | undefined> {
  return {
    icon: toInt(raw.icon) ?? undefined,
    ship: toInt(raw.ship) ?? undefined,
    ball: toInt(raw.ball) ?? undefined,
    ufo: toInt(raw.ufo) ?? undefined,
    wave: toInt(raw.wave) ?? undefined,
    robot: toInt(raw.robot) ?? undefined,
    spider: toInt(raw.spider) ?? undefined,
    swing: toInt(raw.swing) ?? undefined,
    col1: toInt(raw.col1) ?? undefined,
    col2: toInt(raw.col2) ?? undefined,
    colG: toInt(raw.colG) ?? undefined,
    glow: Boolean(raw.glow),
  }
}
