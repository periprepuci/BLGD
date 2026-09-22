import { useEffect, useState } from 'react'

import { cn } from '@/utils/cn'

export interface SmartImageProps {
  src: string | null
  alt: string
  className?: string
  /** Tried in order if `src` fails. Used for the YouTube quality ladder. */
  fallbacks?: string[]
  /** Rendered when every source fails or none was given. */
  placeholder?: React.ReactNode
  loading?: 'lazy' | 'eager'
  onLoaded?: () => void
}

/**
 * An image that degrades honestly.
 *
 * YouTube's `maxresdefault.jpg` only exists when the uploader supplied a
 * high-resolution frame; `hqdefault.jpg` always does. Rather than guessing, we
 * request the best one and step down on error, then fall back to a placeholder
 * instead of leaving a broken-image icon in a card.
 *
 * Lazy loading and async decoding are on by default (requirement 26).
 */
export function SmartImage({
  src,
  alt,
  className,
  fallbacks = [],
  placeholder,
  loading = 'lazy',
  onLoaded,
}: SmartImageProps) {
  const sources = [src, ...fallbacks].filter((value): value is string => Boolean(value))

  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)

  // A new level in the same card slot must start the ladder again.
  useEffect(() => {
    setIndex(0)
    setLoaded(false)
  }, [src])

  const current = sources[index]
  const exhausted = index >= sources.length

  if (!current || exhausted) {
    return <>{placeholder ?? null}</>
  }

  return (
    <>
      {!loaded && placeholder}
      <img
        key={current}
        src={current}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => {
          setLoaded(true)
          onLoaded?.()
        }}
        onError={() => setIndex((value) => value + 1)}
        className={cn(
          'transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
          className,
        )}
      />
    </>
  )
}
