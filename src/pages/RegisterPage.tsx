import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AtSign, Gamepad2, Lock, Mail, MailCheck } from 'lucide-react'

import { AuthShell, FormError } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { useAction } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import * as profilesService from '@/services/profiles.service'
import { validateEmail, validatePassword, validateUsername } from '@/utils/validation'

export function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [gdUsername, setGdUsername] = useState('')
  const [touched, setTouched] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  const usernameCheck = validateUsername(username)
  const emailCheck = validateEmail(email)
  const passwordCheck = validatePassword(password)

  const submit = useAction(async () => {
    const { needsEmailConfirmation } = await signUp({ email, password, username })

    // Linking Geometry Dash is optional here and best-effort: if the account
    // name is wrong, or the provider is down, the account is still created and
    // the link can be made from Settings. Only possible when a session exists,
    // because RLS requires one.
    if (!needsEmailConfirmation && gdUsername.trim()) {
      try {
        const profile = await profilesService.getProfileByUsername(username)
        if (profile) await profilesService.linkGdAccount(profile.id, gdUsername)
      } catch (error) {
        toast.info(
          'Account created, Geometry Dash not linked',
          error instanceof Error ? error.message : 'You can link it from Settings.',
        )
      }
    }

    return { needsEmailConfirmation }
  })

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!usernameCheck.ok || !emailCheck.ok || !passwordCheck.ok) return

    const result = await submit.run()
    if (!result) return

    if (result.needsEmailConfirmation) {
      setAwaitingConfirmation(true)
      return
    }

    toast.success('Account created', 'Link your Geometry Dash account to pull in your stars.')
    navigate('/dashboard', { replace: true })
  }

  if (awaitingConfirmation) {
    return (
      <AuthShell title="Check your email" subtitle="One more step before you can log in.">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-xl border border-ink-750 bg-ink-850 p-3">
            <MailCheck className="h-6 w-6 text-brand-400" aria-hidden="true" />
          </div>
          <p className="text-sm leading-relaxed text-ink-300">
            We sent a confirmation link to <span className="text-ink-100">{email}</span>. Open it and
            you will be signed in.
          </p>
          <Link to="/login" className="text-sm font-semibold text-brand-400 hover:underline">
            Back to log in
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Then link your Geometry Dash account and start logging demons."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-400 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Username"
          required
          autoComplete="username"
          placeholder="yourhandle"
          leading={<AtSign className="h-4 w-4" />}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          error={touched ? (usernameCheck.ok ? null : usernameCheck.message) : null}
          hint="Your profile lives at /profile/username."
        />

        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          leading={<Mail className="h-4 w-4" />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={touched ? (emailCheck.ok ? null : emailCheck.message) : null}
        />

        <Input
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          leading={<Lock className="h-4 w-4" />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={touched ? (passwordCheck.ok ? null : passwordCheck.message) : null}
          hint="At least 8 characters."
        />

        <Input
          label="Geometry Dash username"
          autoComplete="off"
          placeholder="Optional"
          leading={<Gamepad2 className="h-4 w-4" />}
          value={gdUsername}
          onChange={(event) => setGdUsername(event.target.value)}
          hint="Used to pull your live star count. You can add it later."
        />

        <FormError message={submit.error} />

        <Button type="submit" fullWidth size="lg" loading={submit.pending}>
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}
