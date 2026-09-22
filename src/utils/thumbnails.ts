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
  /** Hue used for the placeholder, so the fallback matches the card's accent. */
  hue: number
}

export function resolveLevelArtwork(
  level: Pick<LevelRow, 'name' | 'gd_level_id' | 'thumbnail_url' | 'verification_video_url'>,
  completionYouTubeId?: string | null,
): LevelArtwork {
  const hue = hueFromString(`${level.name}${level.gd_level_id}`)

  const own = thumbnailUrl(completionYouTubeId ?? null)
  if (own) return { url: own, source: 'completion', hue }

  const verification = thumbnailUrl(extractYouTubeId(level.verification_video_url))
  if (verification) return { url: verification, source: 'verification', hue }

  if (level.thumbnail_url) return { url: level.thumbnail_url, source: 'stored', hue }

  return { url: null, source: 'placeholder', hue }
}

/**
 * The stored `levels.thumbnail_url`. Only set when we have a real image; the
 * placeholder is a render-time concern and is never written to the database.
 */
export function derivedThumbnailUrl(verificationVideoUrl: string | null): string | null {
  return thumbnailUrl(extractYouTubeId(verificationVideoUrl))
}
