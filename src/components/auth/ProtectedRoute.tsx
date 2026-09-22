import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { useAuth } from '@/hooks/useAuth'

function AuthPending() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-ink-500" aria-hidden="true" />
      <span className="sr-only">Checking your session…</span>
    </div>
  )
}

/**
 * Route guard.
 *
 * Note what this is and is not: a redirect for people who are not signed in.
 * It is not a security boundary - that is Row Level Security in Postgres, which
 * applies whether or not this component renders. Removing this guard would make
 * the app ugly, not insecure.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthPending />

  if (!user) {
    // Remember where they were going so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}

/** Admin-only routes. `is_admin` is also checked by every RLS policy. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading, profileLoading } = useAuth()
  const location = useLocation()

  if (loading || profileLoading) return <AuthPending />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile?.is_admin) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}

/** Keeps signed-in people off /login and /register. */
export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading, recoveryMode } = useAuth()

  if (loading) return <AuthPending />
  // During a password reset there *is* a session, but the only sensible
  // destination is the reset form - so do not bounce to the dashboard.
  if (user && !recoveryMode) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
