/**
 * resolve-level
 * ---------------------------------------------------------------------------
 * Turns a Geometry Dash level ID into a catalogue row: fetches the level from
 * the Geometry Dash provider, its current AREDL rank from our mirror (or from
 * AREDL directly when the mirror is empty), its full credit list and its
 * verification video, then upserts `levels` with the service_role key.
 *
 * Doing this server-side means the shared catalogue is written by one
 * authoritative path rather than by whatever each browser managed to fetch, and
 * it keeps one rate-limit budget for the whole group.
 *
 * The frontend falls back to doing the same work client-side when this function
 * is not deployed - see src/services/edge.ts.
 *
 * Deploy: supabase functions deploy resolve-level
 */

import { fail, json, preflight, thumbnailFromVideo, toInt } from '../_shared/http.ts'
import {
  fetchAredlDetail,
  fetchAredlList,
  fetchGdLevel,
  visibleVerificationVideo,
  type AredlRawLevel,
} from '../_shared/providers.ts'
import { resolveCaller, serviceClient } from '../_shared/supabase.ts'

/**
 * Resolves the AREDL entry for a Geometry Dash level id.
 *
 * Reads the mirror first - one indexed lookup instead of an 850 KB download.
 * Falls back to the live list when the mirror has not been synced yet.
 *
 * Note what this does NOT do: call `/api/aredl/levels/<gd level id>`. That
 * endpoint resolves its path parameter as a uuid OR a list position OR a level
 * id, so `/levels/128` returns the level ranked #128. Matching on the
 * `level_id` field is the only unambiguous way to key on a Geometry Dash id.
 */
async function resolveAredlEntry(
  db: ReturnType<typeof serviceClient>,
  gdLevelId: number,
): Promise<{ entry: AredlRawLevel | null; source: 'mirror' | 'direct' | 'unavailable' }> {
  // Not `.maybeSingle()`: a level listed both solo and two-player has two rows
  // here, and maybeSingle would error on the second. Ordering picks the solo
  // entry, which is the harder achievement and the rank the app stamps.
  const { data: rows, error } = await db
    .from('aredl_levels')
    .select('*')
    .eq('gd_level_id', gdLevelId)
    .order('two_player', { ascending: true })
    .order('position', { ascending: true })
    .limit(1)

  const data = rows?.[0] ?? null

  if (!error && data) {
    return {
      entry: {
        id: data.aredl_id ?? undefined,
        name: data.name,
        position: data.position,
        level_id: data.gd_level_id,
        status: data.status ?? undefined,
        points: data.points ?? undefined,
        gddl_tier: data.gddl_tier,
        two_player: data.two_player,
        tags: data.tags ?? [],
        description: data.description ?? null,
      },
      source: 'mirror',
    }
  }

  // Mirror miss. It could genuinely not be on the list, or the mirror may never
  // have been synced - only the live list can tell those apart.
  const { count } = await db
    .from('aredl_levels')
    .select('aredl_id', { count: 'exact', head: true })

  if ((count ?? 0) > 0) return { entry: null, source: 'mirror' }

  try {
    const list = await fetchAredlList()
    // Same rule as the mirror: solo first, then the better position.
    const matches = list
      .filter((item) => item.level_id === gdLevelId)
      .sort((a, b) =>
        Boolean(a.two_player) !== Boolean(b.two_player)
          ? Number(Boolean(a.two_player)) - Number(Boolean(b.two_player))
          : (a.position ?? 0) - (b.position ?? 0),
      )
    return { entry: matches[0] ?? null, source: 'direct' }
  } catch {
    return { entry: null, source: 'unavailable' }
  }
}

Deno.serve(async (request) => {
  const cors = preflight(request)
  if (cors) return cors

  if (request.method !== 'POST') return fail(request, 'Use POST.', 405)

  // Writing to the shared catalogue requires a session. Reads are public, but
  // creating rows is not.
  const caller = await resolveCaller(request)
  if (!caller) return fail(request, 'Sign in first.', 401)

  let body: { gd_level_id?: unknown }
  try {
    body = await request.json()
  } catch {
    return fail(request, 'Expected a JSON body.')
  }

  const gdLevelId = toInt(body.gd_level_id)
  if (gdLevelId === null || gdLevelId <= 0) {
    return fail(request, 'gd_level_id must be a positive integer.')
  }

  const db = serviceClient()

  try {
    // --- Geometry Dash (required) ------------------------------------------
    const gdLevel = await fetchGdLevel(gdLevelId)

    // --- AREDL (optional) --------------------------------------------------
    const { entry, source: aredlSource } = await resolveAredlEntry(db, gdLevelId)

    let creators: string[] = []
    let verificationVideo: string | null = null

    if (entry?.id) {
      try {
        const detail = await fetchAredlDetail(entry.id, gdLevelId)
        if (detail) {
          creators = detail.creators
          verificationVideo = visibleVerificationVideo(detail.detail)
        }
      } catch {
        // Rank without credits is still worth having.
      }
    }

    if (creators.length === 0 && gdLevel.author?.trim()) {
      creators = [gdLevel.author.trim()]
    }

    const status =
      entry?.status === 'MainList' || entry?.status === 'Legacy' ? entry.status : null

    const now = new Date().toISOString()

    const { data: level, error } = await db
      .from('levels')
      .upsert(
        {
          gd_level_id: gdLevelId,
          name: entry?.name?.trim() || gdLevel.name!.trim(),
          creator: gdLevel.author?.trim() || null,
          creators,
          gd_account_id: toInt(gdLevel.accountID),
          gd_player_id: toInt(gdLevel.playerID),
          difficulty: gdLevel.difficulty?.trim() || null,
          length: gdLevel.length?.trim() || null,
          song_name: gdLevel.songName?.trim() || null,
          downloads: toInt(gdLevel.downloads),
          likes: toInt(gdLevel.likes),
          description: gdLevel.description?.trim() || null,
          aredl_id: entry?.id ?? null,
          aredl_rank: entry?.position ?? null,
          aredl_status: status,
          // The mirror already stores the true scale; a live-list fallback does not.
          aredl_points:
            typeof entry?.points === 'number'
              ? aredlSource === 'mirror'
                ? entry.points
                : entry.points / 10
              : null,
          gddl_tier: typeof entry?.gddl_tier === 'number' ? entry.gddl_tier : null,
          tags: Array.isArray(entry?.tags) ? entry.tags : [],
          verification_video_url: verificationVideo,
          thumbnail_url: thumbnailFromVideo(verificationVideo),
          aredl_synced_at: aredlSource === 'unavailable' ? null : now,
          gd_synced_at: now,
        },
        { onConflict: 'gd_level_id' },
      )
      .select()
      .single()

    if (error) return fail(request, `Could not save the level: ${error.message}`, 500)

    return json(request, {
      level,
      sources: { gd: 'edge', aredl: aredlSource === 'unavailable' ? 'unavailable' : 'edge' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = (error as { status?: number }).status === 404 ? 404 : 502
    return fail(request, message, status)
  }
})
