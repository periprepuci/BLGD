import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /** `inline` drops the panel chrome, for empties nested inside a card. */
  variant?: 'panel' | 'inline'
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  variant = 'panel',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        variant === 'panel' && 'panel',
        className,
      )}
    >
      <div className="mb-4 rounded-xl border border-ink-750 bg-ink-850 p-3">
        <Icon className="h-6 w-6 text-ink-400" aria-hidden="true" />
      </div>
      <h3 className="text-base">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-400">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  action,
  className,
}: {
  title?: string
  message: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'panel flex flex-col items-center justify-center px-6 py-10 text-center',
        className,
      )}
    >
      <h3 className="text-base text-red-300">{title}</h3>
      <p className="mt-2 max-w-md break-words text-sm leading-relaxed text-ink-400">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
