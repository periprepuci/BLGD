import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'

import { AuthShell, FormError } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { useAction } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  // `useAction.run` resolves to null when the action threw, so returning a
  // truthy value is how a void action reports success without a second state
  // read that React has not re-rendered yet.
  const submit = useAction(async () => {
    await signIn({ email, password })
    return true as const
  })

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!(await submit.run())) return
    toast.success('Welcome back')
    navigate(from, { replace: true })
  }

  return (
    <AuthShell
      title="Log in"
      subtitle="Pick up where you left off."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-semibold text-brand-400 hover:underline">
            Register
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          leading={<Mail className="h-4 w-4" />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <div className="space-y-1.5">
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            leading={<Lock className="h-4 w-4" />}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-xs text-ink-400 transition hover:text-brand-400"
            >
              Forgot your password?
            </Link>
          </div>
        </div>

        <FormError message={submit.error} />

        <Button type="submit" fullWidth size="lg" loading={submit.pending}>
          Log in
        </Button>
      </form>
    </AuthShell>
  )
}
