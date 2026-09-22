import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { env } from '@/lib/env'

/** Shared chrome for the four auth screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} · ${env.siteName}`
  }, [title])

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.75rem)] w-full max-w-md flex-col justify-center px-4 py-12">
      <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 font-display text-lg font-bold text-white">
          {env.siteName.charAt(0)}
        </span>
        <span className="font-display text-xl font-bold tracking-tight text-ink-100">
          {env.siteName}
        </span>
      </Link>

      <div className="panel p-6 sm:p-8">
        <h1 className="text-xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>

      {footer && <div className="mt-6 text-center text-sm text-ink-400">{footer}</div>}
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
    >
      {message}
    </p>
  )
}
