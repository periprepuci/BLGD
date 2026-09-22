/**
 * Data-fetching hooks.
 *
 * The app has a handful of read patterns and no need for a cache library on top
 * of the TTL cache in `lib/cache.ts`, so this is deliberately small: run an
 * async function, track loading/error/data, cancel on unmount, and expose a
 * `reload`.
 */

import { useCallback, useDebugValue, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  /** True on the first load only - lets a list show skeletons once. */
  initialLoading: boolean
  reload: () => Promise<void>
  setData: (updater: T | ((current: T | null) => T | null)) => void
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Something went wrong'
}

export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled !== false

  const [data, setDataState] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const controllerRef = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controllerRef.current?.abort()
    }
  }, [])

  const run = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const result = await loaderRef.current(controller.signal)
      if (controller.signal.aborted || !mounted.current) return
      setDataState(result)
    } catch (caught) {
      if (controller.signal.aborted || !mounted.current) return
      // An aborted fetch is not a failure the user should see.
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(messageOf(caught))
    } finally {
      if (!controller.signal.aborted && mounted.current) {
        setLoading(false)
        setLoadedOnce(true)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps])

  const setData = useCallback((updater: T | ((current: T | null) => T | null)) => {
    setDataState((current) =>
      typeof updater === 'function' ? (updater as (c: T | null) => T | null)(current) : updater,
    )
  }, [])

  useDebugValue(loading ? 'loading' : (error ?? 'ready'))

  return { data, error, loading, initialLoading: loading && !loadedOnce, reload: run, setData }
}

/**
 * Wraps a one-shot action (submit, delete, sync) with pending/error state, and
 * refuses to run twice at once.
 */
export function useAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
): {
  run: (...args: Args) => Promise<Result | null>
  pending: boolean
  error: string | null
  reset: () => void
} {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actionRef = useRef(action)
  actionRef.current = action

  const pendingRef = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async (...args: Args): Promise<Result | null> => {
    if (pendingRef.current) return null

    pendingRef.current = true
    setPending(true)
    setError(null)

    try {
      return await actionRef.current(...args)
    } catch (caught) {
      if (mounted.current) setError(messageOf(caught))
      return null
    } finally {
      pendingRef.current = false
      if (mounted.current) setPending(false)
    }
  }, [])

  return { run, pending, error, reset: () => setError(null) }
}
