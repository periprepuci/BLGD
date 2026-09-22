/**
 * sync-gd-profile
 * ---------------------------------------------------------------------------
 * Re-reads a member's Geometry Dash stats and writes them to their profile.
 *
 * This is the piece that makes star counts live for *everyone*, not just for
 * yourself: RLS stops one member writing another member's row, so refreshing a
 * friend's stars when you open their profile has to happen server-side with the
 * service_role key.
 *
 * Abuse is bounded by a server-side minimum interval rather than by trusting
 * the caller: any signed-in member may ask for any profile to be refreshed, but
 * a profile synced two minutes ago is returned as-is.
 *
 * Deploy: supabase functions deploy sync-gd-profile
 */

import { fail, json, preflight, toInt } from '../_shared/http.ts'
import { fetchGdProfile, gdIconPayload } from '../_shared/providers.ts'
import { resolveCaller, serviceClient } from '../_shared/supabase.ts'

/** Minimum time between two syncs of the same profile. */
const MIN_INTERVAL_MS = 10 * 60 * 1000

/** Even a forced refresh cannot hammer the provider faster than this. */
const FORCE_MIN_INTERVAL_MS = 30 * 1000

Deno.serve(async (request) => {
  const cors = preflight(request)
  if (cors) return cors

  if (request.method !== 'POST') return fail(request, 'Use POST.', 405)

  const caller = await resolveCaller(request)
  if (!caller) return fail(request, 'Sign in first.', 401)

  let body: { profile_id?: unknown; force?: unknown }
  try {
    body = await request.json()
  } catch {
    return fail(request, 'Expected a JSON body.')
  }

  const profileId = typeof body.profile_id === 'string' ? body.profile_id : caller.id
  const force = body.force === true

  const db = serviceClient()

  const { data: profile, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle()

  if (error) return fail(request, `Could not read that profile: ${error.message}`, 500)
  if (!profile) return fail(request, 'No such profile.', 404)

  if (!profile.gd_username) {
    return json(request, { profile, refreshed: false, reason: 'no_linked_account' })
  }

  // --- rate limiting --------------------------------------------------------
  const lastSync = profile.gd_synced_at ? new Date(profile.gd_synced_at).getTime() : 0
  const age = Date.now() - lastSync
  const floor = force ? FORCE_MIN_INTERVAL_MS : MIN_INTERVAL_MS

  if (age < floor) {
    return json(request, { profile, refreshed: false, reason: 'too_recent' })
  }

  // --- refresh --------------------------------------------------------------
  try {
    const player = await fetchGdProfile(profile.gd_username)

    const { data: updated, error: updateError } = await db
      .from('profiles')
      .update({
        // The provider is the authority on capitalisation too.
        gd_username: player.username!.trim(),
        gd_account_id: toInt(player.accountID),
        gd_player_id: toInt(player.playerID),
        gd_stars: toInt(player.stars),
        gd_moons: toInt(player.moons),
        gd_diamonds: toInt(player.diamonds),
        gd_demons: toInt(player.demons),
        // Classic only: AREDL is a classic-mode list.
        gd_extreme_demons: toInt(player.classicDemonsCompleted?.extreme),
        gd_icon: gdIconPayload(player),
        gd_synced_at: new Date().toISOString(),
      })
      .eq('id', profileId)
      .select()
      .single()

    if (updateError) {
      return fail(request, `Could not save the stats: ${updateError.message}`, 500)
    }

    return json(request, { profile: updated, refreshed: true })
  } catch (caught) {
    const status = (caught as { status?: number }).status

    // A Geometry Dash outage, or a player who renamed, must not look like a
    // server error - the profile is still perfectly readable, just stale.
    return json(request, {
      profile,
      refreshed: false,
      reason: status === 404 ? 'player_not_found' : 'provider_unavailable',
    })
  }
})
