import { cn } from '@/utils/cn'
import { hueFromString, initials } from '@/utils/format'
import { SmartImage } from './SmartImage'

export interface AvatarProps {
  /** Rendered Geometry Dash icon, when the member has linked an account. */
  src: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = {
  sm: 'h-8 w-8 rounded-lg text-[0.625rem]',
  md: 'h-11 w-11 rounded-xl text-xs',
  lg: 'h-16 w-16 rounded-xl text-base',
  xl: 'h-24 w-24 rounded-2xl text-2xl',
} as const

/**
 * A member's avatar.
 *
 * The image is GDBrowser's rendered cube for the linked Geometry Dash account.
 * When there is no linked account - or the renderer is unreachable - this falls
 * back to initials on a colour derived from the name, so the fallback is stable
 * per person rather than random per render.
 */
export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const hue = hueFromString(name)

  const placeholder = (
    <span
      className="absolute inset-0 flex items-center justify-center font-display font-bold text-white/90"
      style={{
        background: `linear-gradient(140deg, hsl(${hue} 45% 26%), hsl(${(hue + 40) % 360} 40% 16%))`,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden border border-ink-700/70 bg-ink-850',
        SIZES[size],
        className,
      )}
    >
      <SmartImage
        src={src}
        alt=""
        placeholder={placeholder}
        className="absolute inset-0 h-full w-full object-contain p-1"
      />
    </div>
  )
}
