/**
 * A tiny TTL cache with an in-memory tier and an optional localStorage tier.
 *
 * The point is requirement 15/26: "no quiero hacer cientos de llamadas
 * innecesarias". The AREDL ranking is ~850 KB and changes a few times a day;
 * a Geometry Dash profile changes when its owner plays. Neither deserves a
 * network round trip per render.
 *
 * localStorage can throw (private windows, blocked site data, quota), so every
 * access is guarded and the cache degrades to memory-only rather than breaking
 * the page.
 */

interface Entry<T> {
  value: T
  expiresAt: number
}

const memory = new Map<string, Entry<unknown>>()

const PREFIX = 'blgd.cache.'

function readPersisted<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Entry<T>
    if (typeof parsed?.expiresAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writePersisted<T>(key: string, entry: Entry<T>): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    /* quota or blocked storage - memory tier still works */
  }
}

export interface CacheOptions {
  /** Time to live in milliseconds. */
  ttl: number
  /** Also survive a page reload. Default false. */
  persist?: boolean
}

export function cacheGet<T>(key: string, options: CacheOptions): T | null {
  const now = Date.now()

  const hit = memory.get(key) as Entry<T> | undefined
  if (hit && hit.expiresAt > now) return hit.value

  if (options.persist) {
    const stored = readPersisted<T>(key)
    if (stored && stored.expiresAt > now) {
      memory.set(key, stored)
      return stored.value
    }
  }

  return null
}

export function cacheSet<T>(key: string, value: T, options: CacheOptions): T {
  const entry: Entry<T> = { value, expiresAt: Date.now() + options.ttl }
  memory.set(key, entry)
  if (options.persist) writePersisted(key, entry)
  return value
}

export function cacheDelete(key: string): void {
  memory.delete(key)
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

/** Drops every BLGD cache entry. Used by the manual "refresh" affordances. */
export function cacheClear(prefix = ''): void {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key)
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX + prefix)) localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

const inflight = new Map<string, Promise<unknown>>()

/**
 * Cache-aside with request coalescing: ten components asking for the AREDL
 * list at once produce one fetch, not ten.
 */
export async function cached<T>(
  key: string,
  options: CacheOptions,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key, options)
  if (hit !== null) return hit

  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const promise = loader()
    .then((value) => cacheSet(key, value, options))
    .finally(() => inflight.delete(key))

  inflight.set(key, promise)
  return promise
}

export const TTL = {
  /** AREDL publishes changes a few times a day; 30 min is plenty. */
  aredlList: 30 * 60 * 1000,
  aredlLevel: 30 * 60 * 1000,
  /** A player's stars move only when they play. */
  gdProfile: 15 * 60 * 1000,
  /** Level metadata is effectively immutable once rated. */
  gdLevel: 24 * 60 * 60 * 1000,
  /** Search results: short, just enough to survive a re-render storm. */
  search: 2 * 60 * 1000,
} as const
