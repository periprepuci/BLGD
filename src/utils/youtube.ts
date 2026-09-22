/**
 * YouTube URL handling.
 *
 * We deliberately do not use the YouTube Data API: it needs a key, and the only
 * thing we want from a completion link is the video id, which is in the URL.
 * Thumbnails come from `img.youtube.com`, which needs no key either.
 */

/** A YouTube video id is always 11 characters of [A-Za-z0-9_-]. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

/**
 * Extracts the video id from any of the URL shapes people actually paste.
 * Returns null for anything that is not a YouTube video link - including
 * `javascript:` and `data:` URLs, which is the point: the result of this
 * function is what ends up in an `href`.
 */
export function extractYouTubeId(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // A bare id, in case someone pastes just that.
  if (VIDEO_ID.test(trimmed)) return trimmed

  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null

  // https://youtu.be/<id>
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && VIDEO_ID.test(id) ? id : null
  }

  // https://www.youtube.com/watch?v=<id>
  const v = url.searchParams.get('v')
  if (v && VIDEO_ID.test(v)) return v

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(segments[0]!)) {
    const id = segments[1]!
    return VIDEO_ID.test(id) ? id : null
  }

  return null
}

export function isValidYouTubeUrl(input: string | null | undefined): boolean {
  return extractYouTubeId(input) !== null
}

/** Canonical watch URL. Always built from the id, never echoed from input. */
export function watchUrl(videoId: string | null | undefined): string | null {
  if (!videoId || !VIDEO_ID.test(videoId)) return null
  return `https://www.youtube.com/watch?v=${videoId}`
}

export type ThumbQuality = 'maxres' | 'hq' | 'mq'

const QUALITY_FILE: Record<ThumbQuality, string> = {
  maxres: 'maxresdefault.jpg',
  hq: 'hqdefault.jpg',
  mq: 'mqdefault.jpg',
}

/**
 * `maxresdefault` exists only when the uploader provided a high-res frame;
 * `hqdefault` always exists. Components start at maxres and fall back on error
 * (see `components/ui/SmartImage.tsx`).
 */
export function thumbnailUrl(
  videoId: string | null | undefined,
  quality: ThumbQuality = 'maxres',
): string | null {
  if (!videoId || !VIDEO_ID.test(videoId)) return null
  return `https://img.youtube.com/vi/${videoId}/${QUALITY_FILE[quality]}`
}
