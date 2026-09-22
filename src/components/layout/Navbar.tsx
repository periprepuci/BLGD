import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Plus,
  Settings,
  Shield,
  Swords,
  Trophy,
  User,
  X,
} from 'lucide-react'

import { Button, ButtonLink } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { env } from '@/lib/env'
import { avatarUrl, displayNameOf } from '@/services/profiles.service'
import { cn } from '@/utils/cn'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, requiresAuth: true },
  { to: '/levels', label: 'Levels', icon: Swords, requiresAuth: false },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy, requiresAuth: false },
  { to: '/aredl', label: 'AREDL list', icon: ListOrdered, requiresAuth: false },
]

export function Navbar({ onAddDemon }: { onAddDemon?: () => void }) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Any navigation closes whatever is open - otherwise the mobile sheet stays
  // over the page you just navigated to.
  useEffect(() => {
    setMobileOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out')
      navigate('/')
    } catch (error) {
      toast.error('Could not sign out', error instanceof Error ? error.message : undefined)
    }
  }

  const items = NAV.filter((item) => !item.requiresAuth || user)

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-[3.75rem] max-w-[110rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label={`${env.siteName} home`}>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-display text-sm font-bold text-white">
            {env.siteName.charAt(0)}
          </span>
          <span className="hidden font-display text-lg font-bold tracking-tight text-ink-100 sm:block">
            {env.siteName}
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-ink-850 text-ink-100'
                    : 'text-ink-400 hover:bg-ink-850/60 hover:text-ink-200',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user && onAddDemon && (
            <Button size="sm" onClick={onAddDemon} className="hidden sm:inline-flex">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add demon
            </Button>
          )}

          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setMenuOpen((open) => !open)
                }}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-ink-850"
              >
                <Avatar src={avatarUrl(profile)} name={displayNameOf(profile)} size="sm" />
                <span className="hidden max-w-[8rem] truncate text-sm font-semibold text-ink-200 lg:block">
                  {displayNameOf(profile)}
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  onClick={(event) => event.stopPropagation()}
                  className="panel absolute right-0 top-full mt-2 w-56 animate-fade-up overflow-hidden p-1"
                >
                  {profile && (
                    <Link
                      to={`/profile/${profile.username}`}
                      role="menuitem"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
                    >
                      <User className="h-4 w-4" aria-hidden="true" />
                      My profile
                    </Link>
                  )}
                  <Link
                    to="/settings"
                    role="menuitem"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    Settings
                  </Link>
                  {profile?.is_admin && (
                    <Link
                      to="/admin"
                      role="menuitem"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
                    >
                      <Shield className="h-4 w-4" aria-hidden="true" />
                      Admin
                    </Link>
                  )}
                  <hr className="my-1 border-ink-800" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-red-400"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <ButtonLink to="/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink to="/register" size="sm">
                Register
              </ButtonLink>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="rounded-lg p-2 text-ink-300 transition hover:bg-ink-850 md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="animate-fade-up border-t border-ink-800 bg-ink-950/95 px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-ink-850 text-ink-100'
                      : 'text-ink-400 hover:bg-ink-850/60 hover:text-ink-200',
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}

            {user && onAddDemon && (
              <Button onClick={onAddDemon} className="mt-2" fullWidth>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Extreme Demon
              </Button>
            )}

            {!user && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ButtonLink to="/login" variant="secondary" fullWidth>
                  Log in
                </ButtonLink>
                <ButtonLink to="/register" fullWidth>
                  Register
                </ButtonLink>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
