import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface StatTileProps {
  label: string
  value: ReactNode
  /** Small qualifier under the value, e.g. "of 10" or "from 27 demons". */
  detail?: ReactNode
  icon?: LucideIcon
  tone?: 'default' | 'brand'
  className?: string
}

/**
 * One number with its label. Value first in the visual hierarchy, label above
 * it in small caps - the number is what people scan for.
 */
export function StatTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-ink-750/80 bg-ink-850/60 p-3.5',
        tone === 'brand' && 'border-brand-500/25 bg-brand-500/[0.06]',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon && (
          <Icon
            className={cn('h-3.5 w-3.5', tone === 'brand' ? 'text-brand-400' : 'text-ink-400')}
            aria-hidden="true"
          />
        )}
        <span className="stat-label">{label}</span>
      </div>
      <p
        className={cn(
          'mt-1.5 font-display text-2xl font-bold leading-none tabular-nums',
          tone === 'brand' ? 'text-brand-300' : 'text-ink-100',
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-ink-500">{detail}</p>}
    </div>
  )
}
