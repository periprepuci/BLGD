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

/**
 * Turns a Postgrest or GoTrue error into something a person can act on.
 *
 * Supabase's own wording is written for developers - "Email rate limit
 * exceeded" tells you nothing about what to do, and "Database error saving new
 * user" is downright alarming. Anything not recognised is passed through
 * unchanged rather than flattened into a generic apology.
 */
export function describeError(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error

  const e = error as { message?: string; details?: string; hint?: string; code?: string }

  // --- Postgres ------------------------------------------------------------
  if (e.code === '23505') return 'You have already logged this level.'
  if (e.code === '23514') return 'Those values are outside the allowed range.'
  if (e.code === '42501') return 'You do not have permission to do that.'
  if (e.code === 'PGRST116') return 'Not found.'

  // --- Supabase Auth -------------------------------------------------------
  const message = e.message ?? ''

  if (/email rate limit|rate limit exceeded|over_email_send_rate_limit/i.test(message)) {
    return (
      'Too many emails sent from this project in the last hour. ' +
      'Supabase’s built-in mail server allows only a handful. ' +
      'Wait an hour and try again, or ask an admin to turn off email confirmation.'
    )
  }
  if (/email not confirmed/i.test(message)) {
    return 'Open the confirmation link we emailed you before signing in.'
  }
  if (/invalid login credentials/i.test(message)) {
    return 'Wrong email or password.'
  }
  if (/user already registered|already been registered/i.test(message)) {
    return 'That email already has an account. Try logging in instead.'
  }
  if (/password should be at least/i.test(message)) {
    return 'That password is too short.'
  }
  if (/for security purposes.*(\d+) seconds/i.test(message)) {
    return message.replace(/^For security purposes, you can only request this after/i,
      'Too quick - try again in')
  }
  if (/signups not allowed|signup is disabled/i.test(message)) {
    return 'Registration is closed on this site right now.'
  }

  return message || e.details || e.hint || 'Something went wrong'
}
