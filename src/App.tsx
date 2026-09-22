import { Suspense, lazy, useEffect } from 'react'
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { AdminRoute, GuestOnlyRoute, ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ToastProvider } from '@/hooks/useToast'
import { AppLayout } from '@/layouts/AppLayout'
import { isSupabaseConfigured } from '@/lib/env'

import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SetupPage } from '@/pages/SetupPage'

// Split the heavier authenticated screens out of the initial bundle: a visitor
// landing on the home page should not download the admin table or the AREDL
// list renderer to read the pitch.
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const LevelsPage = lazy(() => import('@/pages/LevelsPage').then((m) => ({ default: m.LevelsPage })))
const LevelDetailPage = lazy(() =>
  import('@/pages/LevelDetailPage').then((m) => ({ default: m.LevelDetailPage })),
)
const LeaderboardPage = lazy(() =>
  import('@/pages/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })),
)
const AredlPage = lazy(() => import('@/pages/AredlPage').then((m) => ({ default: m.AredlPage })))
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })))

/** Keeps hand-typed /level/:id links working by forwarding to /levels/:id. */
function RedirectToLevel() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={id ? `/levels/${id}` : '/levels'} replace />
}

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-ink-500" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

/**
 * Two cross-cutting router behaviours.
 *
 * 1. Password recovery. Supabase's reset link lands on the app root carrying a
 *    `?code=` parameter, which supabase-js exchanges for a session and then
 *    announces as a PASSWORD_RECOVERY event. There is no token in the URL for
 *    us to route on - which is exactly why HashRouter is safe here - so the
 *    event is what sends the user to the form.
 *
 * 2. Scroll restoration. HashRouter does not reset scroll between routes.
 */
function RouterEffects() {
  const { recoveryMode } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (recoveryMode && location.pathname !== '/reset-password') {
      navigate('/reset-password', { replace: true })
    }
  }, [recoveryMode, location.pathname, navigate])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  return null
}

export default function App() {
  // No Supabase, no app. Say so rather than rendering a shell that throws on
  // its first query.
  if (!isSupabaseConfigured) return <SetupPage />

  return (
    <ErrorBoundary>
      {/*
        HashRouter, deliberately.

        GitHub Pages serves static files and has no rewrite rules, so a direct
        request for /profile/someone returns its 404 page. The usual workaround
        is a 404.html that re-encodes the path and bounces through index.html,
        which adds a redirect to every deep link and interferes with the
        `?code=` parameter Supabase appends to auth redirects. Routing on the
        fragment removes both problems: the server only ever sees the app root.
        The cost is a `#` in the URL, which is the honest trade for a host with
        no server side.
      */}
      <HashRouter>
        <AuthProvider>
          <ToastProvider>
            <RouterEffects />

            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route index element={<HomePage />} />

                  <Route
                    path="login"
                    element={
                      <GuestOnlyRoute>
                        <LoginPage />
                      </GuestOnlyRoute>
                    }
                  />
                  <Route
                    path="register"
                    element={
                      <GuestOnlyRoute>
                        <RegisterPage />
                      </GuestOnlyRoute>
                    }
                  />
                  <Route
                    path="forgot-password"
                    element={
                      <GuestOnlyRoute>
                        <ForgotPasswordPage />
                      </GuestOnlyRoute>
                    }
                  />
                  <Route path="reset-password" element={<ResetPasswordPage />} />

                  <Route
                    path="dashboard"
                    element={
                      <ProtectedRoute>
                        <DashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <ProtectedRoute>
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="admin"
                    element={
                      <AdminRoute>
                        <AdminPage />
                      </AdminRoute>
                    }
                  />

                  {/* Public read: profiles, levels and the boards are shareable. */}
                  <Route path="profile/:username" element={<ProfilePage />} />
                  <Route path="levels" element={<LevelsPage />} />
                  <Route path="levels/:id" element={<LevelDetailPage />} />
                  <Route path="leaderboard" element={<LeaderboardPage />} />
                  <Route path="aredl" element={<AredlPage />} />

                  {/* Tolerate the singular form people type by hand. */}
                  <Route path="level/:id" element={<RedirectToLevel />} />

                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  )
}
