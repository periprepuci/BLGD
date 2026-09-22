import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'

/**
 * Two clients, two different jobs.
 *
 * `serviceClient()` bypasses Row Level Security and is what writes the shared
 * catalogue and the AREDL mirror. Its key comes from the function's environment
 * and never leaves the server.
 *
 * `callerClient()` carries the caller's JWT, so anything it reads or writes is
 * still subject to that user's RLS policies. It is used only to answer "who is
 * calling, and are they allowed to ask for this?".
 */

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Both are injected ' +
        'automatically for deployed functions; for `supabase functions serve` put ' +
        'them in supabase/functions/.env.local.',
    )
  }

  return createClient(url, key, { auth: { persistSession: false } })
}

export function callerClient(request: Request): SupabaseClient | null {
  const authorization = request.headers.get('Authorization')
  if (!authorization) return null

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon) return null

  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  })
}

export interface Caller {
  id: string
  isAdmin: boolean
}

/** Resolves the signed-in caller, or null when the request is unauthenticated. */
export async function resolveCaller(request: Request): Promise<Caller | null> {
  const client = callerClient(request)
  if (!client) return null

  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null

  // Read the admin flag with the service client: `is_admin` is deliberately
  // outside the column grant for `authenticated`, so the caller's own client
  // can read it but must never be the thing that decides it.
  const { data: profile } = await serviceClient()
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .maybeSingle()

  return { id: data.user.id, isAdmin: Boolean(profile?.is_admin) }
}

/**
 * True when the request carries the shared sync secret.
 *
 * This is the machine path: a pg_cron job or a GitHub Action can call
 * `sync-aredl` without a user session by sending `x-sync-secret`. If
 * SYNC_SECRET is unset, this always returns false rather than allowing
 * everything.
 */
export function hasSyncSecret(request: Request): boolean {
  const expected = Deno.env.get('SYNC_SECRET')
  if (!expected) return false

  const provided = request.headers.get('x-sync-secret')
  if (!provided || provided.length !== expected.length) return false

  // Constant-time comparison: a timing oracle on a shared secret is cheap to
  // avoid and awkward to explain afterwards.
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return diff === 0
}

export async function logRun(
  client: SupabaseClient,
  entry: {
    kind: string
    status: 'ok' | 'error'
    levels_seen?: number | null
    levels_updated?: number | null
    message?: string | null
    duration_ms?: number | null
  },
): Promise<void> {
  try {
    await client.from('sync_runs').insert(entry)
  } catch {
    // Logging must never be the reason a sync fails.
  }
}
