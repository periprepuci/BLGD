import { Play } from 'lucide-react'

import { SmartImage } from '@/components/ui/SmartImage'
import type { LevelRow } from '@/types/database'
import { cn } from '@/utils/cn'
import { resolveLevelArtwork } from '@/utils/thumbnails'
import { thumbnailUrl } from '@/utils/youtube'

export interface LevelThumbnailProps {
  level: Pick<LevelRow, 'name' | 'gd_level_id' | 'thumbnail_url' | 'verification_video_url'>
  /** The viewer's own completion video, which takes priority over AREDL's. */
  completionVideoId?: string | null
  className?: string
  /** Shows a play affordance when the card links to a video. */
  showPlayHint?: boolean
  eager?: boolean
}

/**
 * Level artwork with an honest fallback.
 *
 * Geometry Dash publishes no level previews, so the image is a YouTube
 * thumbnail: the player's own completion first, then AREDL's verification
 * video. When neither exists the placeholder is a generated panel carrying the
 * level's initial on a hue derived from its name - visibly a placeholder, not a
 * fake screenshot.
 */
export function LevelThumbnail({
  level,
  completionVideoId,
  className,
  showPlayHint = false,
  eager = false,
}: LevelThumbnailProps) {
  const artwork = resolveLevelArtwork(level, completionVideoId)

  // YouTube only guarantees hqdefault; step down rather than show a broken img.
  const videoId = completionVideoId ?? null
  const fallbacks = [
    thumbnailUrl(videoId, 'hq'),
    artwork.source === 'verification' ? thumbnailUrl(videoId, 'mq') : null,
  ].filter((value): value is string => Boolean(value))

  const placeholder = (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        background: `linear-gradient(135deg, hsl(${artwork.hue} 38% 20%), hsl(${
          (artwork.hue + 35) % 360
        } 30% 11%))`,
      }}
      aria-hidden="true"
    >
      <span className="font-display text-4xl font-bold text-white/15">
        {level.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    </div>
  )

  return (
    <div className={cn('relative overflow-hidden bg-ink-850', className)}>
      <SmartImage
        src={artwork.url}
        alt={`${level.name} preview`}
        fallbacks={fallbacks}
        placeholder={placeholder}
        loading={eager ? 'eager' : 'lazy'}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Keeps overlaid text legible whatever the frame happens to contain. */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-ink-950/75 via-ink-950/15 to-transparent"
        aria-hidden="true"
      />

      {showPlayHint && (
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          aria-hidden="true"
        >
          <span className="rounded-full bg-ink-950/70 p-3 backdrop-blur-sm">
            <Play className="h-5 w-5 fill-brand-400 text-brand-400" />
          </span>
        </div>
      )}
    </div>
  )
}
