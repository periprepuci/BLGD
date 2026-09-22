import { useEffect, useState } from 'react'

/**
 * Debounced mirror of a value. Used by the search inputs so that typing
 * "bloodlust" is one request, not nine.
 */
export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
