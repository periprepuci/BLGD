/**
 * Shared helpers for the Edge Functions.
 *
 * These run on Deno inside Supabase, not in the browser, so they have their own
 * copy of the small utilities rather than importing from `src/` - Edge
 * Functions are deployed independently of the frontend bundle.
 */

/**
 * CORS.
 *
 * The functions are called from the deployed site (GitHub Pages) and from
 * localhost during development. `ALLOWED_ORIGINS` is an optional, comma
 * separated secret; when it is set, only those origins are answered. When it is
 * not set we reflect the request origin, which is the same posture the upstream
 * APIs take and is safe here because every function still requires a valid
 * Supabase JWT - the browser's origin is not what authorises the call.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '*'
  const allowList = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const allowed =
    allowList.length === 0 ? origin : allowList.includes(origin) ? origin : allowList[0]!

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-sync-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function json(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}

export function fail(request: Request, message: string, status = 400): Response {
  return json(request, { error: message }, status)
}

export function preflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null
  return new Response('ok', { headers: corsHeaders(request) })
}

/** GET + JSON parse with a timeout, so one slow upstream cannot hang a function. */
export async function getJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'blgd-edge/1.0' },
    })

    if (!response.ok) {
      throw new HttpError(`Upstream responded ${response.status}`, response.status)
    }

    const text = (await response.text()).trim()
    if (!text) throw new HttpError('Empty upstream response', 502)

    // GDBrowser signals "nothing matched" with a bare `-1` and HTTP 200. That
    // parses as valid JSON, so it must be caught before JSON.parse, not after.
    if (text === '-1') throw new HttpError('Not found', 404)

    try {
      return JSON.parse(text) as T
    } catch {
      throw new HttpError('Upstream did not return JSON', 502)
    }
  } finally {
    clearTimeout(timer)
  }
}

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'HttpError'
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404
}

export function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** Extracts a YouTube video id. Mirrors `src/utils/youtube.ts`. */
export function youTubeId(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed

  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return null

  if (host.endsWith('youtu.be')) {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  }

  const v = url.searchParams.get('v')
  if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(segments[0]!)) {
    const id = segments[1]!
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  }

  return null
}

export function thumbnailFromVideo(url: string | null): string | null {
  const id = youTubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null
}
