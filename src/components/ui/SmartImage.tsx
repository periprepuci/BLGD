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
 * YouTube's "no thumbnail" image is 120x90. Every real thumbnail we request is
 * larger: mqdefault is 320x180, hqdefault 480x360, maxresdefault 1280x720.
 */
const DEGENERATE_WIDTH = 120
const DEGENERATE_HEIGHT = 90

/**
 * An image that degrades honestly.
 *
 * YouTube's `maxresdefault.jpg` only exists when the uploader supplied a
 * high-resolution frame; `hqdefault.jpg` always does. Rather than guessing, we
 * request the best one and step down, then fall back to a placeholder instead
 * of leaving a broken-image icon in a card.
 *
 * Stepping down cannot rely on the `error` event alone. A missing
 * `maxresdefault` is answered with HTTP 404 *and* a perfectly valid 120x90 grey
 * placeholder body, which browsers render happily without firing `error`. So a
 * successful load is also checked against DEGENERATE_* below, and a frame that
 * small is treated as a miss. Bloodbath's 2015 verification video is exactly
 * this case.
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
        onLoad={(event) => {
          const image = event.currentTarget
          const degenerate =
            image.naturalWidth > 0 &&
            image.naturalWidth <= DEGENERATE_WIDTH &&
            image.naturalHeight <= DEGENERATE_HEIGHT

          // Step past it - and past the end of the ladder if need be, because
          // our own placeholder reads better than YouTube's grey box.
          if (degenerate) {
            setIndex((value) => value + 1)
            return
          }

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
