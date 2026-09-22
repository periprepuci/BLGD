/**
 * Level artwork.
 *
 * Geometry Dash exposes no preview image for a level: the servers return level
 * data and the compressed level string, and there is no render service. So the
 * honest options are, in order of preference:
 *
 *   1. The thumbnail of the player's own completion video. Most personal, and
 *      it is a frame of the actual level.
 *   2. The thumbnail of the AREDL verification video for that level.
 *   3. A generated placeholder derived from the level name.
 *
 * Nothing here invents an image and presents it as official artwork.
 */

import type { LevelRow } from '@/types/database'
import { extractYouTubeId, thumbnailUrl } from './youtube'
import { hueFromString } from './format'

export type ThumbnailSource = 'completion' | 'verification' | 'stored' | 'placeholder'

export interface LevelArtwork {
  url: string | null
  source: ThumbnailSource
  /**
   * The YouTube video the artwork came from, when it came from one.
   *
   * Callers need this to build the quality fallback ladder: `maxresdefault`
   * only exists when the uploader supplied a high-resolution frame, and older
   * videos often have none. Bloodbath's 2015 verification is exactly that case
   * - maxres 404s, hqdefault is fine - so without this the card fell straight
   * through to the placeholder.
   */
  videoId: string | null
  /** Hue used for the placeholder, so the fallback matches the card's accent. */
  hue: number
}

export function resolveLevelArtwork(
  level: Pick<LevelRow, 'name' | 'gd_level_id' | 'thumbnail_url' | 'verification_video_url'>,
  completionYouTubeId?: string | null,
): LevelArtwork {
  const hue = hueFromString(`${level.name}${level.gd_level_id}`)

  const ownId = completionYouTubeId ?? null
  const own = thumbnailUrl(ownId)
  if (own) return { url: own, source: 'completion', videoId: ownId, hue }

  const verificationId = extractYouTubeId(level.verification_video_url)
  const verification = thumbnailUrl(verificationId)
  if (verification) {
    return { url: verification, source: 'verification', videoId: verificationId, hue }
  }

  if (level.thumbnail_url) {
    return { url: level.thumbnail_url, source: 'stored', videoId: null, hue }
  }

  return { url: null, source: 'placeholder', videoId: null, hue }
}

/**
 * Lower-quality URLs to try when the preferred one fails, best first.
 *
 * `hqdefault` is the only size YouTube guarantees for every video, so it is
 * always in the ladder; `mqdefault` is a last resort before the placeholder.
 */
export function artworkFallbacks(artwork: LevelArtwork): string[] {
  if (!artwork.videoId) return []
  return [thumbnailUrl(artwork.videoId, 'hq'), thumbnailUrl(artwork.videoId, 'mq')].filter(
    (value): value is string => Boolean(value),
  )
}

/**
 * The stored `levels.thumbnail_url`. Only set when we have a real image; the
 * placeholder is a render-time concern and is never written to the database.
 */
export function derivedThumbnailUrl(verificationVideoUrl: string | null): string | null {
  return thumbnailUrl(extractYouTubeId(verificationVideoUrl))
}
