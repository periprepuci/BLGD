import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'

import { AuthShell, FormError } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { useAction } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { validatePassword } from '@/utils/validation'

/**
 * Set a new password.
 *
 * Reachable in two ways: from the recovery email (supabase-js exchanges the
 * `?code=` parameter, emits PASSWORD_RECOVERY, and the app routes here), or
 * from Settings while already signed in.
 */
export function ResetPasswordPage() {
  const { user, loading, updatePassword, recoveryMode } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)

  const passwordCheck = validatePassword(password)
  const matches = password === confirm

  const submit = useAction(async () => {
    await updatePassword(password)
    return true as const
  })

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!passwordCheck.ok || !matches) return

    if (!(await submit.run())) return
    toast.success('Password updated')
    navigate('/dashboard', { replace: true })
  }

  if (loading) return null

  // Without a session there is nothing to update - the recovery link is what
  // creates one, so arriving here without it means the link expired.
  if (!user && !recoveryMode) return <Navigate to="/forgot-password" replace />

  return (
    <AuthShell title="Set a new password" subtitle="Pick something you have not used here before.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          leading={<Lock className="h-4 w-4" />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={touched ? (passwordCheck.ok ? null : passwordCheck.message) : null}
        />

        <Input
          label="Confirm new password"
          type="password"
          required
          autoComplete="new-password"
          leading={<Lock className="h-4 w-4" />}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={touched && !matches ? 'Those do not match.' : null}
        />

        <FormError message={submit.error} />

        <Button type="submit" fullWidth size="lg" loading={submit.pending}>
          Update password
        </Button>
      </form>
    </AuthShell>
  )
}
