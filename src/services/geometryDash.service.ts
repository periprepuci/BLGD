/**
 * Geometry Dash data provider.
 *
 * There is no modern official Geometry Dash API. RobTop's servers
 * (`boomlings.com/database/*.php`) speak form-encoded POST, answer with a
 * custom `key:value:key:value` format, send no CORS headers and are not
 * intended for third-party traffic.
 *
 * The provider used here is GDBrowser (https://gdbrowser.com), the long-running
 * community front-end. It proxies the official servers, returns JSON and sends
 * `Access-Control-Allow-Origin: *`, so it works from the browser and from an
 * Edge Function alike. Endpoints used, all verified against the live service:
 *
 *   GET /api/level/:id        -> level metadata
 *   GET /api/profile/:user    -> player stats (stars, moons, demons, icons)
 *   GET /api/search/:query    -> level search
 *   GET /icon/:user           -> rendered PNG of the player's icon
 *
 * Everything the app reads goes through this module, so replacing the provider
 * means rewriting the four `parse*` functions below and nothing else.
 */

import { cached, cacheSet, TTL } from '@/lib/cache'
import { env } from '@/lib/env'
import { getJson, HttpError, isNotFound } from '@/lib/http'
import type { GdLevel, GdPlayer } from '@/types/domain'
import type { GdIcon } from '@/types/database'

const BASE = env.gdApiBase

// --- raw provider shapes ----------------------------------------------------

interface RawGdLevel {
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
  stars?: number
  cp?: number
  demonList?: number
}

interface RawGdProfile {
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
}

// --- parsing ----------------------------------------------------------------

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function parseLevel(raw: RawGdLevel, fallbackId: number): GdLevel {
  const difficulty = raw.difficulty?.trim() || null
  return {
    gdLevelId: toInt(raw.id) ?? fallbackId,
    name: raw.name?.trim() || `Level ${fallbackId}`,
    creator: raw.author?.trim() || null,
    accountId: toInt(raw.accountID),
    playerId: toInt(raw.playerID),
    difficulty,
    length: raw.length?.trim() || null,
    songName: raw.songName?.trim() || null,
    downloads: toInt(raw.downloads),
    likes: toInt(raw.likes),
    description: raw.description?.trim() || null,
    isExtremeDemon: difficulty?.toLowerCase() === 'extreme demon',
  }
}

function parseProfile(raw: RawGdProfile, requested: string): GdPlayer {
  const icon: GdIcon = {
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

  return {
    username: raw.username?.trim() || requested,
    accountId: toInt(raw.accountID),
    playerId: toInt(raw.playerID),
    stars: toInt(raw.stars),
    moons: toInt(raw.moons),
    diamonds: toInt(raw.diamonds),
    demons: toInt(raw.demons),
    icon,
  }
}

// --- public API -------------------------------------------------------------

export class GdNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GdNotFoundError'
  }
}

/** Fetches one level by its Geometry Dash level id. */
export async function getLevel(gdLevelId: number, signal?: AbortSignal): Promise<GdLevel> {
  return cached(`gd.level.${gdLevelId}`, { ttl: TTL.gdLevel, persist: true }, async () => {
    try {
      const raw = await getJson<RawGdLevel>(`${BASE}/api/level/${gdLevelId}`, { signal })
      if (!raw || typeof raw !== 'object' || !raw.name) {
        throw new GdNotFoundError(`No Geometry Dash level with ID ${gdLevelId}.`)
      }
      return parseLevel(raw, gdLevelId)
    } catch (error) {
      if (isNotFound(error)) throw new GdNotFoundError(`No Geometry Dash level with ID ${gdLevelId}.`)
      throw error
    }
  })
}

/**
 * Fetches a player by their in-game username.
 *
 * This is how the app gets live star counts. There is no way to *prove* a user
 * owns the account they typed - Geometry Dash has no OAuth - so the link is
 * declarative. The consequence is documented in the README under "Known
 * limitations"; the mitigation is the unique index on `profiles.gd_account_id`,
 * which at least stops two members claiming the same account.
 */
export async function getPlayer(
  username: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<GdPlayer> {
  const key = `gd.player.${username.toLowerCase()}`
  const loader = async () => {
    try {
      const raw = await getJson<RawGdProfile>(
        `${BASE}/api/profile/${encodeURIComponent(username)}`,
        { signal: options.signal },
      )
      if (!raw || typeof raw !== 'object' || !raw.username) {
        throw new GdNotFoundError(`No Geometry Dash player called "${username}".`)
      }
      return parseProfile(raw, username)
    } catch (error) {
      if (isNotFound(error)) throw new GdNotFoundError(`No Geometry Dash player called "${username}".`)
      throw error
    }
  }

  if (options.force) {
    return cacheSet(key, await loader(), { ttl: TTL.gdProfile, persist: true })
  }
  return cached(key, { ttl: TTL.gdProfile, persist: true }, loader)
}

export interface LevelSearchOptions {
  /** Restrict to Extreme Demons. Default true - this is an Extreme Demon site. */
  extremeDemonsOnly?: boolean
  count?: number
  signal?: AbortSignal
}

/**
 * Searches Geometry Dash levels by name. GDBrowser's `/api/search/:query`
 * accepts a numeric query as a level id, so this handles both cases.
 */
export async function searchLevels(
  query: string,
  { extremeDemonsOnly = true, count = 20, signal }: LevelSearchOptions = {},
): Promise<GdLevel[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const key = `gd.search.${extremeDemonsOnly ? 'ed' : 'all'}.${count}.${trimmed.toLowerCase()}`

  return cached(key, { ttl: TTL.search }, async () => {
    const params = new URLSearchParams({ count: String(count) })
    // GDBrowser passes RobTop's own difficulty filter through: `diff=-2` is
    // "demon" and `demonFilter=5` narrows that to Extreme. Verified against the
    // live service - `diff=6` (the value the difficulty *face* uses) makes the
    // endpoint answer 500, so do not "simplify" this.
    if (extremeDemonsOnly) {
      params.set('diff', '-2')
      params.set('demonFilter', '5')
    }

    try {
      const raw = await getJson<RawGdLevel[] | RawGdLevel>(
        `${BASE}/api/search/${encodeURIComponent(trimmed)}?${params}`,
        { signal },
      )
      const list = Array.isArray(raw) ? raw : [raw]
      return list
        .filter((item): item is RawGdLevel => Boolean(item && typeof item === 'object' && item.name))
        .map((item) => parseLevel(item, toInt(item.id) ?? 0))
    } catch (error) {
      // "no results" comes back as a 404 from the provider.
      if (isNotFound(error)) return []
      throw error
    }
  })
}

/**
 * URL of the rendered player icon. GDBrowser composes the cube from the
 * player's saved icon and colours and serves it as a PNG with open CORS.
 */
export function playerIconUrl(username: string | null | undefined): string | null {
  if (!username?.trim()) return null
  return `${BASE}/icon/${encodeURIComponent(username.trim())}?size=auto`
}

/** True when the provider answered at all - used by the admin health check. */
export async function providerHealthy(signal?: AbortSignal): Promise<boolean> {
  try {
    await getJson(`${BASE}/api/level/128`, { signal, retry: false, timeoutMs: 8000 })
    return true
  } catch (error) {
    return error instanceof HttpError && error.status < 500
  }
}
