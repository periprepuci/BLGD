import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'
import { env, isSupabaseConfigured } from './env'

export type Db = SupabaseClient<Database>

/**
 * A single client for the whole app.
 *
 * `persistSession` + `autoRefreshToken` give us session persistence across
 * reloads (requirement: "persistencia de sesión"). `detectSessionInUrl` is what
 * completes the PKCE exchange after an email confirmation or a password-reset
 * link lands back on the site.
 *
 * PKCE is used rather than the implicit flow because it puts the exchange code
 * in a query parameter (`?code=`) instead of the URL hash - and the hash is
 * already taken by HashRouter. See `src/App.tsx` for why we route on the hash.
 */
function makeClient(): Db | null {
  if (!isSupabaseConfigured) return null

  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'blgd.auth',
    },
    global: {
      headers: { 'x-application-name': 'blgd' },
    },
  })
}

export const supabase = makeClient()

/**
 * Narrowing helper. Every service call goes through this so that a missing
 * configuration surfaces as one clear error instead of `null` dereferences
 * scattered across the codebase.
 */
export function requireSupabase(): Db {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and fill in ' +
        'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  return supabase
}

/** Turns a PostgrestError (or anything else) into a readable message. */
export function describeError(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error

  const e = error as { message?: string; details?: string; hint?: string; code?: string }

  if (e.code === '23505') return 'You have already logged this level.'
  if (e.code === '23514') return 'Those values are outside the allowed range.'
  if (e.code === '42501') return 'You do not have permission to do that.'
  if (e.code === 'PGRST116') return 'Not found.'

  return e.message || e.details || e.hint || 'Something went wrong'
}
