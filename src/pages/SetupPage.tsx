import { AlertTriangle } from 'lucide-react'

import { env } from '@/lib/env'

/**
 * Shown instead of the app when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
 * are missing.
 *
 * Without them there is no database, no auth and nothing to render, so a blank
 * page with a console error would be the alternative. This says what to do.
 */
export function SetupPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16">
      <div className="panel p-6 sm:p-8">
        <div className="mb-5 inline-flex rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle className="h-6 w-6 text-amber-400" aria-hidden="true" />
        </div>

        <h1 className="text-2xl">{env.siteName} is not configured yet</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          The app needs a Supabase project before it can do anything. This takes about five minutes.
        </p>

        <ol className="mt-6 space-y-4 text-sm leading-relaxed text-ink-300">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-800 font-display text-xs font-bold text-brand-400">
              1
            </span>
            <span>
              Create a free project at{' '}
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-400 hover:underline"
              >
                supabase.com/dashboard
              </a>
              .
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-800 font-display text-xs font-bold text-brand-400">
              2
            </span>
            <span>
              Open the SQL Editor and run{' '}
              <code className="rounded bg-ink-850 px-1.5 py-0.5 font-mono text-xs text-ink-200">
                supabase/migrations/20260922000000_initial_schema.sql
              </code>{' '}
              from this repository.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-800 font-display text-xs font-bold text-brand-400">
              3
            </span>
            <span>
              Copy{' '}
              <code className="rounded bg-ink-850 px-1.5 py-0.5 font-mono text-xs text-ink-200">
                .env.example
              </code>{' '}
              to{' '}
              <code className="rounded bg-ink-850 px-1.5 py-0.5 font-mono text-xs text-ink-200">
                .env
              </code>{' '}
              and fill in the project URL and the anon key from Project Settings → API.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-800 font-display text-xs font-bold text-brand-400">
              4
            </span>
            <span>
              Restart the dev server. Vite only reads{' '}
              <code className="rounded bg-ink-850 px-1.5 py-0.5 font-mono text-xs text-ink-200">
                .env
              </code>{' '}
              at startup.
            </span>
          </li>
        </ol>

        <p className="mt-6 border-t border-ink-800 pt-5 text-xs leading-relaxed text-ink-500">
          The anon key is meant to be public — Row Level Security is what protects the data. Never
          put the <code className="font-mono">service_role</code> key in a{' '}
          <code className="font-mono">VITE_</code> variable; it belongs only in Edge Function
          secrets. Full instructions are in the README.
        </p>
      </div>
    </div>
  )
}
