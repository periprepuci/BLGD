/**
 * Supabase Edge Function client.
 *
 * Edge Functions are the preferred path for anything that touches an external
 * API: they run server-side with the service_role key, cache into Postgres and
 * keep one rate-limit budget for the whole group instead of one per browser.
 *
 * They are not, however, *required*. Both upstream APIs send permissive CORS
 * headers, so the browser can talk to them directly. The app therefore treats a
 * missing Edge Function as "fall back to direct" rather than as a failure, and
 * you can clone this repo, point it at a fresh Supabase project and add a demon
 * before ever installing the Supabase CLI.
 *
 * `VITE_DATA_MODE` controls the policy:
 *   auto   - try Edge, fall back to direct (default)
 *   edge   - Edge only; surfaces an error if a function is missing
 *   direct - skip Edge entirely
 */

import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

export type EdgeFunctionName = 'sync-aredl' | 'resolve-level' | 'sync-gd-profile'

export class EdgeUnavailableError extends Error {
  constructor(readonly fn: EdgeFunctionName, message: string) {
    super(message)
    this.name = 'EdgeUnavailableError'
  }
}

/**
 * Remembers, for this page load, which functions are not deployed so we stop
 * paying a round trip to rediscover it. Cleared by `resetEdgeAvailability`
 * after a deploy (the admin page exposes it).
 */
const knownMissing = new Set<EdgeFunctionName>()

export function resetEdgeAvailability(): void {
  knownMissing.clear()
}

export function edgeEnabled(): boolean {
  return env.dataMode !== 'direct' && supabase !== null
}

export function edgeRequired(): boolean {
  return env.dataMode === 'edge'
}

interface EdgeErrorContext {
  status?: number
}

function statusOf(error: unknown): number | undefined {
  const ctx = (error as { context?: EdgeErrorContext })?.context
  return typeof ctx?.status === 'number' ? ctx.status : undefined
}

/**
 * Invokes an Edge Function. Returns `null` when the function is unavailable and
 * the caller is allowed to fall back; throws when the data mode demands Edge.
 */
export async function invokeEdge<T>(
  fn: EdgeFunctionName,
  body: Record<string, unknown> = {},
): Promise<T | null> {
  if (!edgeEnabled()) return null
  if (knownMissing.has(fn)) {
    if (edgeRequired()) throw new EdgeUnavailableError(fn, `Edge Function "${fn}" is not deployed.`)
    return null
  }

  const client = supabase
  if (!client) return null

  const { data, error } = await client.functions.invoke<T>(fn, { body })

  if (!error) return data ?? null

  const status = statusOf(error)

  // 404 = not deployed. Anything network-level means we could not reach the
  // functions host at all. Both are "unavailable", not "your request was bad".
  const unavailable = status === 404 || status === undefined

  if (unavailable) {
    knownMissing.add(fn)
    if (edgeRequired()) {
      throw new EdgeUnavailableError(
        fn,
        `Edge Function "${fn}" could not be reached. Deploy it with ` +
          `\`supabase functions deploy ${fn}\` or set VITE_DATA_MODE=auto.`,
      )
    }
    return null
  }

  // A real server-side error (400/401/500) is the function telling us
  // something. Surface it rather than silently doing the work client-side.
  let detail = error.message
  try {
    const response = (error as { context?: Response }).context
    if (response instanceof Response) {
      const payload = (await response.clone().json()) as { error?: string }
      if (payload?.error) detail = payload.error
    }
  } catch {
    /* keep the original message */
  }

  throw new Error(detail)
}
