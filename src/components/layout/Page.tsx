import { useEffect, type ReactNode } from 'react'

import { env } from '@/lib/env'
import { cn } from '@/utils/cn'

export interface PageProps {
  title: string
  /** Browser tab title. Defaults to `title`. */
  documentTitle?: string
  description?: ReactNode
  /** Buttons or controls aligned to the right of the heading. */
  actions?: ReactNode
  children: ReactNode
  /**
   * `wide` uses the full viewport on large screens, which is what the level
   * grids and leaderboards want. `narrow` caps the measure for reading.
   */
  width?: 'wide' | 'narrow'
  className?: string
}

export function Page({
  title,
  documentTitle,
  description,
  actions,
  children,
  width = 'wide',
  className,
}: PageProps) {
  useEffect(() => {
    document.title = `${documentTitle ?? title} · ${env.siteName}`
  }, [title, documentTitle])

  return (
    <div
      className={cn(
        'mx-auto px-4 py-8 sm:px-6 sm:py-10 lg:px-8',
        width === 'wide' ? 'max-w-[110rem]' : 'max-w-3xl',
        className,
      )}
    >
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl">{title}</h1>
          {description && (
            <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-400">
              {description}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>

      {children}
    </div>
  )
}

/** A titled block within a page. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink-100">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
