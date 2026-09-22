/**
 * sync-aredl
 * ---------------------------------------------------------------------------
 * Refreshes the local mirror of the AREDL ranking and re-stamps the AREDL
 * columns on every level anyone here has logged.
 *
 * This is what keeps requirement 6 honest: a level that sat at #27 when someone
 * logged it shows #31 once AREDL moves it, without anyone editing anything.
 *
 * Who may call it
 *   * an admin, with their normal session; or
 *   * any machine that knows SYNC_SECRET, sent as `x-sync-secret`. That is the
 *     path a pg_cron job or a scheduled GitHub Action uses.
 *
 * Deploy:  supabase functions deploy sync-aredl
 * Secrets: supabase secrets set SYNC_SECRET=<a long random string>
 */

import { fail, json, preflight, thumbnailFromVideo } from '../_shared/http.ts'
import {
  fetchAredlDetail,
  fetchAredlList,
  visibleVerificationVideo,
} from '../_shared/providers.ts'
import { hasSyncSecret, logRun, resolveCaller, serviceClient } from '../_shared/supabase.ts'

/** Supabase rejects very large single inserts; the list goes up in batches. */
const BATCH = 500

/**
 * How many levels may have their verification video fetched per run.
 *
 * Backfilling artwork costs two upstream requests per level, so a full
 * catalogue would be hundreds of calls. Capping it means a run stays fast and
 * polite, and the remaining levels are picked up by the next one.
 */
const ARTWORK_BUDGET = 25

interface MirrorRow {
  gd_level_id: number
  aredl_id: string | null
  name: string
  position: number
  status: string | null
  points: number | null
  gddl_tier: number | null
  two_player: boolean
  tags: string[]
  description: string | null
  synced_at: string
}

Deno.serve(async (request) => {
  const cors = preflight(request)
  if (cors) return cors

  if (request.method !== 'POST') return fail(request, 'Use POST.', 405)

  const startedAt = Date.now()

  // --- authorisation -------------------------------------------------------
  if (!hasSyncSecret(request)) {
    const caller = await resolveCaller(request)
    if (!caller) return fail(request, 'Sign in first.', 401)
    if (!caller.isAdmin) return fail(request, 'Admins only.', 403)
  }

  const db = serviceClient()

  try {
    // --- 1. pull the list --------------------------------------------------
    const entries = await fetchAredlList()
    if (entries.length === 0) {
      throw new Error('AREDL returned an empty list; refusing to wipe the mirror.')
    }

    const now = new Date().toISOString()
    const rows: MirrorRow[] = entries.map((entry) => ({
      gd_level_id: entry.level_id!,
      aredl_id: entry.id ?? null,
      name: entry.name?.trim() || `Level ${entry.level_id}`,
      position: entry.position ?? 0,
      status: entry.status ?? null,
      points: typeof entry.points === 'number' ? entry.points : null,
      gddl_tier: typeof entry.gddl_tier === 'number' ? entry.gddl_tier : null,
      two_player: Boolean(entry.two_player),
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      description: entry.description?.trim() || null,
      synced_at: now,
    }))

    // --- 2. write the mirror -----------------------------------------------
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await db
        .from('aredl_levels')
        .upsert(rows.slice(i, i + BATCH), { onConflict: 'gd_level_id' })
      if (error) throw new Error(`Writing the mirror failed: ${error.message}`)
    }

    // Levels that left the list entirely should not linger in the mirror.
    const keep = new Set(rows.map((row) => row.gd_level_id))
    const { data: mirrored } = await db.from('aredl_levels').select('gd_level_id')
    const stale = (mirrored ?? [])
      .map((row) => row.gd_level_id as number)
      .filter((id) => !keep.has(id))

    if (stale.length > 0) {
      await db.from('aredl_levels').delete().in('gd_level_id', stale)
    }

    // --- 3. re-stamp the catalogue -----------------------------------------
    const byGdId = new Map(rows.map((row) => [row.gd_level_id, row]))

    const { data: levels, error: levelsError } = await db
      .from('levels')
      .select('id, gd_level_id, name, aredl_id, aredl_rank, aredl_status, aredl_points, gddl_tier, verification_video_url, thumbnail_url')

    if (levelsError) throw new Error(`Reading the catalogue failed: ${levelsError.message}`)

    let updated = 0
    let artworkBudget = ARTWORK_BUDGET

    for (const level of levels ?? []) {
      const entry = byGdId.get(level.gd_level_id as number) ?? null

      const nextRank = entry?.position ?? null
      const nextStatus =
        entry?.status === 'MainList' || entry?.status === 'Legacy' ? entry.status : null

      const rankChanged =
        nextRank !== level.aredl_rank ||
        nextStatus !== level.aredl_status ||
        (entry?.points ?? null) !== level.aredl_points ||
        (entry?.gddl_tier ?? null) !== level.gddl_tier

      // Levels without artwork get their verification video looked up, within
      // this run's budget. Everything else is a pure rank refresh.
      const wantsArtwork =
        entry?.aredl_id && !level.verification_video_url && artworkBudget > 0

      let verificationVideo: string | null = level.verification_video_url as string | null
      let thumbnail: string | null = level.thumbnail_url as string | null

      if (wantsArtwork) {
        artworkBudget -= 1
        try {
          const detail = await fetchAredlDetail(entry!.aredl_id!, level.gd_level_id as number)
          if (detail) {
            verificationVideo = visibleVerificationVideo(detail.detail)
            thumbnail = thumbnailFromVideo(verificationVideo) ?? thumbnail
          }
        } catch {
          // A single failed detail lookup must not abort the whole sync.
        }
      }

      if (!rankChanged && verificationVideo === level.verification_video_url) continue

      const { error } = await db
        .from('levels')
        .update({
          aredl_id: entry?.aredl_id ?? level.aredl_id,
          aredl_rank: nextRank,
          aredl_status: nextStatus,
          aredl_points: entry?.points ?? null,
          gddl_tier: entry?.gddl_tier ?? null,
          verification_video_url: verificationVideo,
          thumbnail_url: thumbnail,
          aredl_synced_at: now,
        })
        .eq('id', level.id)

      if (!error) updated += 1
    }

    const durationMs = Date.now() - startedAt
    const message = `Mirrored ${rows.length} AREDL entries; updated ${updated} catalogue levels.`

    await logRun(db, {
      kind: 'sync-aredl',
      status: 'ok',
      levels_seen: rows.length,
      levels_updated: updated,
      message,
      duration_ms: durationMs,
    })

    return json(request, {
      ok: true,
      levels_seen: rows.length,
      levels_updated: updated,
      removed_from_mirror: stale.length,
      duration_ms: durationMs,
      message,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    await logRun(db, {
      kind: 'sync-aredl',
      status: 'error',
      message,
      duration_ms: Date.now() - startedAt,
    })

    return fail(request, message, 502)
  }
})
