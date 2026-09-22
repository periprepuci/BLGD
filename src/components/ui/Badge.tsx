import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export type BadgeTone = 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<BadgeTone, string> = {
  brand: 'border-brand-500/35 bg-brand-500/10 text-brand-300',
  neutral: 'border-ink-700 bg-ink-800/80 text-ink-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  danger: 'border-red-500/30 bg-red-500/10 text-red-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.6875rem] font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * The AREDL position badge.
 *
 * Tone carries meaning rather than decoration: top 10 is the brand accent,
 * top 150 is neutral-bright, legacy and unranked are visibly quieter. "Unranked"
 * is a real state - plenty of Extreme Demons are not on the list - and saying so
 * is better than showing a number we do not have.
 */
export function RankBadge({
  rank,
  status,
  className,
  size = 'md',
}: {
  rank: number | null
  status?: 'MainList' | 'Legacy' | null
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass = {
    sm: 'px-1.5 py-0.5 text-[0.625rem]',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1.5 text-base',
  }[size]

  if (rank === null) {
    return (
      <span
        title="This level is not currently on the AREDL ranking."
        className={cn(
          'inline-flex items-center rounded-md border border-ink-700 bg-ink-850 font-display font-semibold text-ink-500',
          sizeClass,
          className,
        )}
      >
        Unranked
      </span>
    )
  }

  const tone =
    status === 'Legacy'
      ? 'border-ink-700 bg-ink-800 text-ink-400'
      : rank <= 10
        ? 'border-brand-500/50 bg-brand-500/15 text-brand-300'
        : rank <= 150
          ? 'border-ink-600 bg-ink-800 text-ink-200'
          : 'border-ink-700 bg-ink-850 text-ink-400'

  return (
    <span
      title={
        status === 'Legacy'
          ? `AREDL legacy list, position ${rank}`
          : `AREDL position ${rank}`
      }
      className={cn(
        'inline-flex items-center rounded-md border font-display font-bold tabular-nums',
        sizeClass,
        tone,
        className,
      )}
    >
      #{rank}
      {status === 'Legacy' && <span className="ml-1 text-[0.625rem] font-medium">legacy</span>}
    </span>
  )
}
