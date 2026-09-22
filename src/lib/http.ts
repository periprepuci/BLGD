/**
 * Minimal fetch wrapper: timeout, one retry on transient failure, and JSON
 * parsing that does not pretend an HTML error page is data.
 */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface JsonRequestOptions {
  /** Abort after this many milliseconds. Default 15000. */
  timeoutMs?: number
  /** Retry once on network error / 5xx / 429. Default true. */
  retry?: boolean
  signal?: AbortSignal
  headers?: Record<string, string>
}

async function once<T>(url: string, options: JsonRequestOptions): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)

  const onOuterAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onOuterAbort)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...options.headers },
    })

    if (!response.ok) {
      throw new HttpError(`Request failed with ${response.status}`, response.status, url)
    }

    const text = (await response.text()).trim()
    if (!text) throw new HttpError('Empty response body', response.status, url)

    // GDBrowser signals "nothing matched" with a bare `-1` and HTTP 200. That
    // is valid JSON, so it has to be caught before parsing rather than in the
    // catch block below.
    if (text === '-1') throw new HttpError('Not found', 404, url)

    try {
      return JSON.parse(text) as T
    } catch {
      // Anything else unparseable is usually an HTML error page from a proxy.
      throw new HttpError('Response was not JSON', 502, url)
    }
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onOuterAbort)
  }
}

function isTransient(error: unknown): boolean {
  if (error instanceof HttpError) return error.status >= 500 || error.status === 429
  return error instanceof TypeError // network-level failure
}

export async function getJson<T>(url: string, options: JsonRequestOptions = {}): Promise<T> {
  try {
    return await once<T>(url, options)
  } catch (error) {
    if (options.retry === false || !isTransient(error) || options.signal?.aborted) throw error
    await new Promise((resolve) => setTimeout(resolve, 600))
    return once<T>(url, options)
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404
}
