/**
 * Profiles: site identity plus the linked Geometry Dash account.
 *
 * Star counts are never typed in by a user. `gd_username` is the only field a
 * member supplies; everything else prefixed `gd_` is written by
 * `syncGdStats`, which reads the Geometry Dash provider. The database column
 * grant in the migration means a member can still only write these columns on
 * their *own* row.
 */

import { describeError, requireSupabase } from '@/lib/supabase'
import type { GdIcon, ProfileRow, ProfileUpdate } from '@/types/database'
import { sanitizeText, validateUsername } from '@/utils/validation'
import { invokeEdge } from './edge'
import * as gd from './geometryDash.service'

/** How stale a profile's Geometry Dash stats may be before we re-fetch. */
export const GD_STATS_TTL_MS = 15 * 60 * 1000

export async function getProfileByUsername(username: string): Promise<ProfileRow | null> {
  const client = requireSupabase()

  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('username_key', username.trim().toLowerCase())
    .maybeSingle()

  if (error) throw new Error(describeError(error))
  return data
}

export async function getProfileById(id: string): Promise<ProfileRow | null> {
  const client = requireSupabase()

  const { data, error } = await client.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(describeError(error))
  return data
}

export async function listProfiles(): Promise<ProfileRow[]> {
  const client = requireSupabase()

  const { data, error } = await client
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw new Error(describeError(error))
  return data ?? []
}

export async function isUsernameAvailable(username: string, exceptId?: string): Promise<boolean> {
  if (!validateUsername(username).ok) return false
  const client = requireSupabase()

  let query = client.from('profiles').select('id').eq('username_key', username.trim().toLowerCase())
  if (exceptId) query = query.neq('id', exceptId)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(describeError(error))
  return data === null
}

export interface ProfilePatch {
  username?: string
  display_name?: string | null
  bio?: string | null
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<ProfileRow> {
  const client = requireSupabase()

  const update: ProfileUpdate = {}

  if (patch.username !== undefined) {
    const username = patch.username.trim()
    const check = validateUsername(username)
    if (!check.ok) throw new Error(check.message)
    update.username = username
  }
  if (patch.display_name !== undefined) {
    const value = patch.display_name ? sanitizeText(patch.display_name, 48) : ''
    update.display_name = value || null
  }
  if (patch.bio !== undefined) {
    const value = patch.bio ? sanitizeText(patch.bio, 280) : ''
    update.bio = value || null
  }

  const { data, error } = await client
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('That username is taken.')
    }
    throw new Error(describeError(error))
  }
  return data
}

// ---------------------------------------------------------------------------
// Geometry Dash link
// ---------------------------------------------------------------------------

/**
 * Resolves a Geometry Dash username against the provider without writing
 * anything - used by the Settings page to preview the account before linking.
 */
export async function previewGdAccount(gdUsername: string) {
  return gd.getPlayer(gdUsername.trim(), { force: true })
}

/**
 * Links (or re-links) a Geometry Dash account and pulls its current stats.
 *
 * Geometry Dash has no OAuth, so this link is declarative: we verify the
 * account *exists*, not that the caller owns it. The unique index on
 * `profiles.gd_account_id` stops two members claiming the same account, which
 * is as far as the platform lets us go. Documented in the README.
 */
export async function linkGdAccount(profileId: string, gdUsername: string): Promise<ProfileRow> {
  const client = requireSupabase()
  const player = await gd.getPlayer(gdUsername.trim(), { force: true })

  const { data, error } = await client
    .from('profiles')
    .update({
      gd_username: player.username,
      gd_account_id: player.accountId,
      gd_player_id: player.playerId,
      gd_stars: player.stars,
      gd_moons: player.moons,
      gd_diamonds: player.diamonds,
      gd_demons: player.demons,
      gd_icon: player.icon,
      gd_synced_at: new Date().toISOString(),
    })
    .eq('id', profileId)
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Another member has already linked that Geometry Dash account.')
    }
    throw new Error(describeError(error))
  }
  return data
}

export async function unlinkGdAccount(profileId: string): Promise<ProfileRow> {
  const client = requireSupabase()

  const { data, error } = await client
    .from('profiles')
    .update({
      gd_username: null,
      gd_account_id: null,
      gd_player_id: null,
      gd_stars: null,
      gd_moons: null,
      gd_diamonds: null,
      gd_demons: null,
      gd_icon: null,
      gd_synced_at: null,
    })
    .eq('id', profileId)
    .select()
    .single()

  if (error) throw new Error(describeError(error))
  return data
}

export function statsAreStale(profile: Pick<ProfileRow, 'gd_synced_at'>): boolean {
  if (!profile.gd_synced_at) return true
  return Date.now() - new Date(profile.gd_synced_at).getTime() > GD_STATS_TTL_MS
}

interface EdgeSyncedProfile {
  profile: ProfileRow
  refreshed: boolean
}

/**
 * Refreshes a profile's Geometry Dash stats.
 *
 * Called when a profile page opens (and only if the data is stale) and from the
 * manual refresh button. Two paths:
 *
 *   * `sync-gd-profile` Edge Function - works for *any* member, because it uses
 *     the service_role key. This is what keeps a friend's star count current
 *     when you visit their page.
 *   * Direct - your own row, or anyone's if you are an admin, because the
 *     "admins update any profile" policy permits the row and every gd_ column
 *     is inside the grant. For anyone else it returns the profile unchanged
 *     rather than pretending to have refreshed it.
 */
export async function syncGdStats(
  profile: ProfileRow,
  options: { force?: boolean; currentUserId?: string | null; isAdmin?: boolean } = {},
): Promise<{ profile: ProfileRow; refreshed: boolean }> {
  if (!profile.gd_username) return { profile, refreshed: false }
  if (!options.force && !statsAreStale(profile)) return { profile, refreshed: false }

  const viaEdge = await invokeEdge<EdgeSyncedProfile>('sync-gd-profile', {
    profile_id: profile.id,
    force: Boolean(options.force),
  })
  if (viaEdge?.profile) return { profile: viaEdge.profile, refreshed: viaEdge.refreshed }

  // Direct path. RLS allows your own row always, and any row when you are an
  // admin; anything else would be refused server-side, so do not bother asking.
  const mayWrite = options.currentUserId === profile.id || options.isAdmin === true
  if (!mayWrite) return { profile, refreshed: false }

  try {
    const updated = await linkGdAccount(profile.id, profile.gd_username)
    return { profile: updated, refreshed: true }
  } catch {
    // A provider outage must not break the profile page.
    return { profile, refreshed: false }
  }
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export function avatarUrl(
  profile: Pick<ProfileRow, 'gd_username'> | null | undefined,
): string | null {
  return gd.playerIconUrl(profile?.gd_username)
}

export function displayNameOf(
  profile: Pick<ProfileRow, 'username' | 'display_name' | 'gd_username'> | null | undefined,
): string {
  if (!profile) return 'Unknown'
  return profile.display_name?.trim() || profile.gd_username?.trim() || profile.username
}

export type { GdIcon }

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

/**
 * Deletes the caller's profile (cascading their completions) and their auth
 * user, via the `delete_own_account` RPC. A client can never delete an
 * `auth.users` row directly, which is why this is a SECURITY DEFINER function
 * scoped to `auth.uid()`.
 */
export async function deleteOwnAccount(): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.rpc('delete_own_account')
  if (error) throw new Error(describeError(error))
}
