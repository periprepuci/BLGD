/**
 * Nightly maintenance: AREDL ranking + every member's Geometry Dash stats.
 *
 *   node scripts/sync/nightly.mjs
 *
 * Does the same work as the `sync-aredl` and `sync-gd-profile` Edge Functions,
 * but from a scheduled GitHub Action instead, which needs no Supabase CLI and
 * no deployment step. The two approaches are alternatives, not a pair - run
 * whichever suits you. See README, "Keeping data fresh".
 *
 * Reads two environment variables:
 *   SUPABASE_URL         the project URL (not a secret)
 *   SUPABASE_SECRET_KEY  a secret/service_role key - bypasses RLS
 *
 * The secret key belongs in GitHub Actions secrets, never in the repo, never
 * in a VITE_ variable, and never in a chat window. Set it with:
 *
 *   gh secret set SUPABASE_SECRET_KEY        # prompts, nothing is echoed
 */

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const SECRET = process.env.SUPABASE_SECRET_KEY ?? ''
const AREDL_BASE = process.env.AREDL_API_BASE ?? 'https://api.aredl.net/v2'
const GD_BASE = process.env.GD_API_BASE ?? 'https://gdbrowser.com'

if (!SUPABASE_URL || !SECRET) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY must both be set.')
  process.exit(2)
}

const BATCH = 500
const headers = {
  apikey: SECRET,
  Authorization: `Bearer ${SECRET}`,
  'Content-Type': 'application/json',
}

const started = Date.now()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Rounds to the precision the database actually stores.
 *
 * `aredl_points` and `gddl_tier` are numeric(_,2), so Postgres rounds whatever
 * we send. AREDL publishes gddl_tier at full float precision - 23.97669491525424
 * for Bloodbath, stored as 23.98 - so comparing the raw value against the
 * stored one marks every level as changed on every run, forever.
 */
const round2 = (value) =>
  value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100

async function rest(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  })
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`)
  }
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function getJson(url, timeoutMs = 45_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'blgd-nightly/1.0' },
    })
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`)
    const text = (await response.text()).trim()
    // GDBrowser signals "nothing matched" with a bare -1 and HTTP 200, which is
    // valid JSON - so it has to be caught before parsing, not after.
    if (text === '-1') throw new Error('not found')
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

async function logRun(entry) {
  try {
    await rest('sync_runs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(entry),
    })
  } catch (error) {
    console.error('  (could not write sync_runs:', error.message, ')')
  }
}

// ---------------------------------------------------------------------------
// 1. AREDL ranking
// ---------------------------------------------------------------------------

async function syncAredl() {
  console.log('\n— AREDL ranking —')

  const raw = await getJson(`${AREDL_BASE}/api/aredl/levels`)
  if (!Array.isArray(raw) || raw.length < 100) {
    throw new Error(`AREDL returned ${Array.isArray(raw) ? raw.length : 'no'} entries; refusing to overwrite the mirror`)
  }

  const now = new Date().toISOString()
  const seen = new Set()

  // Keyed on AREDL's uuid, not gd_level_id: 18 entries are the same Geometry
  // Dash level listed twice, "(Solo)" and "(2P)", at different positions.
  const rows = raw
    .filter((e) => typeof e?.level_id === 'number' && typeof e?.position === 'number'
                   && typeof e?.id === 'string' && e.id.length > 0)
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .map((e) => ({
      aredl_id: e.id,
      gd_level_id: e.level_id,
      name: (e.name ?? `Level ${e.level_id}`).trim(),
      position: e.position,
      status: e.status ?? null,
      points: typeof e.points === 'number' ? e.points : null,
      gddl_tier: typeof e.gddl_tier === 'number' ? e.gddl_tier : null,
      two_player: Boolean(e.two_player),
      tags: Array.isArray(e.tags) ? e.tags : [],
      description: e.description?.trim() || null,
      synced_at: now,
    }))

  for (let i = 0; i < rows.length; i += BATCH) {
    await rest('aredl_levels?on_conflict=aredl_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + BATCH)),
    })
  }

  // Entries that left the list should not linger in the mirror.
  const mirrored = await rest('aredl_levels?select=aredl_id')
  const stale = mirrored.map((r) => r.aredl_id).filter((id) => !seen.has(id))
  if (stale.length > 0) {
    await rest(`aredl_levels?aredl_id=in.(${stale.join(',')})`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  }

  console.log(`  mirrored ${rows.length} entries, removed ${stale.length} stale`)

  // --- re-stamp the catalogue ---------------------------------------------
  // One rank per level, taking the solo listing where a level is listed twice.
  const canonical = new Map()
  for (const row of rows) {
    const existing = canonical.get(row.gd_level_id)
    const better = !existing
      || (existing.two_player !== row.two_player ? !row.two_player : row.position < existing.position)
    if (better) canonical.set(row.gd_level_id, row)
  }

  const levels = await rest(
    'levels?select=id,gd_level_id,name,aredl_rank,aredl_status,aredl_points,gddl_tier',
  )

  let updated = 0
  for (const level of levels) {
    const entry = canonical.get(level.gd_level_id) ?? null
    const nextRank = entry?.position ?? null
    const nextStatus =
      entry?.status === 'MainList' || entry?.status === 'Legacy' ? entry.status : null

    const changed =
      nextRank !== level.aredl_rank ||
      nextStatus !== level.aredl_status ||
      round2(entry?.points ?? null) !== round2(level.aredl_points) ||
      round2(entry?.gddl_tier ?? null) !== round2(level.gddl_tier)

    if (!changed) continue

    await rest(`levels?id=eq.${level.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        aredl_id: entry?.aredl_id ?? null,
        aredl_rank: nextRank,
        aredl_status: nextStatus,
        aredl_points: entry?.points ?? null,
        gddl_tier: entry?.gddl_tier ?? null,
        aredl_synced_at: now,
      }),
    })

    const from = level.aredl_rank === null ? 'unranked' : `#${level.aredl_rank}`
    const to = nextRank === null ? 'unranked' : `#${nextRank}`
    if (from !== to) console.log(`  ${level.name}: ${from} -> ${to}`)
    updated += 1
  }

  console.log(`  ${updated} catalogue level(s) updated`)
  await logRun({
    kind: 'nightly:aredl',
    status: 'ok',
    levels_seen: rows.length,
    levels_updated: updated,
    message: `${rows.length} AREDL entries mirrored (${canonical.size} distinct levels); ${updated} catalogue rows updated.`,
    duration_ms: Date.now() - started,
  })

  return updated
}

// ---------------------------------------------------------------------------
// 2. Every member's Geometry Dash stats
// ---------------------------------------------------------------------------

async function syncProfiles() {
  console.log('\n— Geometry Dash stats —')
  const profiles = await rest('profiles?select=id,username,gd_username,gd_stars&gd_username=not.is.null')

  let refreshed = 0
  for (const profile of profiles) {
    try {
      const player = await getJson(`${GD_BASE}/api/profile/${encodeURIComponent(profile.gd_username)}`)
      if (!player?.username) throw new Error('no such player')

      const toInt = (v) => (v === null || v === undefined || v === '' ? null : Math.trunc(Number(v)))

      await rest(`profiles?id=eq.${profile.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          gd_username: player.username.trim(),
          gd_account_id: toInt(player.accountID),
          gd_player_id: toInt(player.playerID),
          gd_stars: toInt(player.stars),
          gd_moons: toInt(player.moons),
          gd_diamonds: toInt(player.diamonds),
          gd_demons: toInt(player.demons),
          gd_icon: {
            icon: toInt(player.icon), ship: toInt(player.ship), ball: toInt(player.ball),
            ufo: toInt(player.ufo), wave: toInt(player.wave), robot: toInt(player.robot),
            spider: toInt(player.spider), swing: toInt(player.swing),
            col1: toInt(player.col1), col2: toInt(player.col2), colG: toInt(player.colG),
            glow: Boolean(player.glow),
          },
          gd_synced_at: new Date().toISOString(),
        }),
      })

      const delta = toInt(player.stars) - (profile.gd_stars ?? 0)
      console.log(
        `  @${profile.username}: ${player.stars} stars${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}, ${player.demons} demons`,
      )
      refreshed += 1
    } catch (error) {
      // One unreachable player must not abort the run; the old values stay.
      console.log(`  @${profile.username}: skipped (${error.message})`)
    }

    // Be a good citizen towards a free community service.
    await sleep(600)
  }

  console.log(`  ${refreshed}/${profiles.length} profile(s) refreshed`)
  await logRun({
    kind: 'nightly:profiles',
    status: 'ok',
    levels_seen: profiles.length,
    levels_updated: refreshed,
    message: `${refreshed} of ${profiles.length} members refreshed.`,
    duration_ms: Date.now() - started,
  })

  return refreshed
}

// ---------------------------------------------------------------------------

try {
  const levels = await syncAredl()
  const members = await syncProfiles()
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s — ${levels} level(s), ${members} member(s).`)
  process.exit(0)
} catch (error) {
  console.error(`\nFAILED: ${error.message}`)
  await logRun({
    kind: 'nightly',
    status: 'error',
    message: String(error.message).slice(0, 500),
    duration_ms: Date.now() - started,
  })
  process.exit(1)
}
