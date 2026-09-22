import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MailCheck } from 'lucide-react'

import { AuthShell, FormError } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { useAction } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const submit = useAction(async () => {
    await requestPasswordReset(email)
    return true as const
  })

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (await submit.run()) setSent(true)
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="If that address has an account, a link is on its way.">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-xl border border-ink-750 bg-ink-850 p-3">
            <MailCheck className="h-6 w-6 text-brand-400" aria-hidden="true" />
          </div>
          <p className="text-sm leading-relaxed text-ink-300">
            Open the link in that email and you will land back here ready to set a new password.
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
      title="Reset your password"
      subtitle="We will email you a link to set a new one."
      footer={
        <Link to="/login" className="font-semibold text-brand-400 hover:underline">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          leading={<Mail className="h-4 w-4" />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <FormError message={submit.error} />

        <Button type="submit" fullWidth size="lg" loading={submit.pending}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  )
}
