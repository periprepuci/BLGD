/**
 * Auth context.
 *
 * Wraps Supabase Auth and keeps the signed-in user's profile row alongside the
 * session, because almost every screen needs both. Session persistence and
 * token refresh are handled by supabase-js itself (see `lib/supabase.ts`); this
 * layer just mirrors them into React state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { appOrigin } from '@/lib/env'
import { describeError, requireSupabase, supabase } from '@/lib/supabase'
import type { ProfileRow } from '@/types/database'
import * as profilesService from '@/services/profiles.service'
import { validateEmail, validatePassword, validateUsername } from '@/utils/validation'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: ProfileRow | null
  /** True until the initial session lookup has settled. */
  loading: boolean
  /** True while the profile row for a known session is still loading. */
  profileLoading: boolean
  isAdmin: boolean
  /** Set when the user arrived through a password-reset link. */
  recoveryMode: boolean

  signUp: (input: { email: string; password: string; username: string }) => Promise<{
    needsEmailConfirmation: boolean
  }>
  signIn: (input: { email: string; password: string }) => Promise<void>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refreshProfile: () => Promise<ProfileRow | null>
  setProfile: (profile: ProfileRow) => void
  clearRecoveryMode: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfileState] = useState<ProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)

  // Guards against a slow profile fetch for a user who has since signed out.
  const currentUserId = useRef<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true)
    try {
      const row = await profilesService.getProfileById(userId)
      if (currentUserId.current === userId) setProfileState(row)
      return row
    } catch {
      if (currentUserId.current === userId) setProfileState(null)
      return null
    } finally {
      if (currentUserId.current === userId) setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
        currentUserId.current = data.session?.user.id ?? null
        if (data.session?.user) void loadProfile(data.session.user.id)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return

      setSession(nextSession)
      currentUserId.current = nextSession?.user.id ?? null

      // Supabase emits this once the recovery link's code has been exchanged.
      // It is how the app knows to show the "set a new password" screen without
      // needing a token in the URL - which matters because HashRouter owns the
      // fragment. See src/App.tsx.
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)

      if (event === 'SIGNED_OUT') {
        setProfileState(null)
        setRecoveryMode(false)
        return
      }

      if (nextSession?.user) void loadProfile(nextSession.user.id)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signUp = useCallback<AuthContextValue['signUp']>(async ({ email, password, username }) => {
    const client = requireSupabase()

    for (const check of [validateEmail(email), validatePassword(password), validateUsername(username)]) {
      if (!check.ok) throw new Error(check.message)
    }

    const available = await profilesService.isUsernameAvailable(username)
    if (!available) throw new Error('That username is taken.')

    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Picked up by the handle_new_user() trigger to seed profiles.username.
        data: { username: username.trim() },
        emailRedirectTo: appOrigin(),
      },
    })

    if (error) throw new Error(describeError(error))

    // With email confirmation enabled Supabase returns a user but no session.
    return { needsEmailConfirmation: Boolean(data.user) && !data.session }
  }, [])

  const signIn = useCallback<AuthContextValue['signIn']>(async ({ email, password }) => {
    const client = requireSupabase()
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
    // describeError handles the wording, including the rate-limit and
    // unconfirmed-email cases that read as gibberish otherwise.
    if (error) throw new Error(describeError(error))
  }, [])

  const signOut = useCallback(async () => {
    const client = requireSupabase()
    const { error } = await client.auth.signOut()
    if (error) throw new Error(describeError(error))
    setProfileState(null)
    setRecoveryMode(false)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const client = requireSupabase()
    const check = validateEmail(email)
    if (!check.ok) throw new Error(check.message)

    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: appOrigin(),
    })
    if (error) throw new Error(describeError(error))
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const client = requireSupabase()
    const check = validatePassword(password)
    if (!check.ok) throw new Error(check.message)

    const { error } = await client.auth.updateUser({ password })
    if (error) throw new Error(describeError(error))
    setRecoveryMode(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    const userId = currentUserId.current
    if (!userId) return null
    return loadProfile(userId)
  }, [loadProfile])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      isAdmin: Boolean(profile?.is_admin),
      recoveryMode,
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshProfile,
      setProfile: setProfileState,
      clearRecoveryMode: () => setRecoveryMode(false),
    }),
    [
      session,
      profile,
      loading,
      profileLoading,
      recoveryMode,
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
