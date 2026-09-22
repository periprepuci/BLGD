import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AtSign,
  Check,
  Gamepad2,
  Link2Off,
  Lock,
  LogOut,
  Star,
  Trash2,
  Unlink,
} from 'lucide-react'

import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input, Textarea } from '@/components/ui/Field'
import { Page } from '@/components/layout/Page'
import { useAction } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import * as gdService from '@/services/geometryDash.service'
import * as profilesService from '@/services/profiles.service'
import type { GdPlayer } from '@/types/domain'
import { formatNumber, formatRelative } from '@/utils/format'
import { validatePassword, validateUsername } from '@/utils/validation'

function Card({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="font-display text-base font-semibold text-ink-100">{title}</h2>
      {description && <p className="mt-1 text-sm leading-relaxed text-ink-400">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const { user, profile, setProfile, signOut, updatePassword } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  // --- profile ---------------------------------------------------------------
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')

  useEffect(() => {
    if (!profile) return
    setUsername(profile.username)
    setDisplayName(profile.display_name ?? '')
    setBio(profile.bio ?? '')
  }, [profile])

  const usernameCheck = validateUsername(username)
  const profileDirty =
    profile !== null &&
    (username !== profile.username ||
      displayName !== (profile.display_name ?? '') ||
      bio !== (profile.bio ?? ''))

  const saveProfile = useAction(async () => {
    if (!profile) return null
    return profilesService.updateProfile(profile.id, {
      username,
      display_name: displayName,
      bio,
    })
  })

  const onSaveProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (!usernameCheck.ok) return

    const updated = await saveProfile.run()
    if (!updated) {
      if (saveProfile.error) toast.error('Could not save', saveProfile.error)
      return
    }
    setProfile(updated)
    toast.success('Profile updated')
  }

  // --- Geometry Dash link -----------------------------------------------------
  const [gdInput, setGdInput] = useState('')
  const [gdPreview, setGdPreview] = useState<GdPlayer | null>(null)

  const lookupGd = useAction(async () => {
    const player = await gdService.getPlayer(gdInput, { force: true })
    setGdPreview(player)
    return player
  })

  const linkGd = useAction(async () => {
    if (!profile || !gdPreview) return null
    return profilesService.linkGdAccount(profile.id, gdPreview.username)
  })

  const unlinkGd = useAction(async () => {
    if (!profile) return null
    return profilesService.unlinkGdAccount(profile.id)
  })

  const onLookup = async (event: FormEvent) => {
    event.preventDefault()
    setGdPreview(null)
    if (!(await lookupGd.run()) && lookupGd.error) toast.error('Not found', lookupGd.error)
  }

  const onLink = async () => {
    const updated = await linkGd.run()
    if (!updated) {
      if (linkGd.error) toast.error('Could not link', linkGd.error)
      return
    }
    setProfile(updated)
    setGdPreview(null)
    setGdInput('')
    toast.success('Geometry Dash linked', `${formatNumber(updated.gd_stars)} stars pulled in.`)
  }

  const onUnlink = async () => {
    const updated = await unlinkGd.run()
    if (!updated) return
    setProfile(updated)
    toast.success('Geometry Dash unlinked')
  }

  // --- password ---------------------------------------------------------------
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const passwordCheck = validatePassword(password)

  const changePassword = useAction(async () => {
    await updatePassword(password)
    return true as const
  })

  const onChangePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (!passwordCheck.ok || password !== confirm) return

    if (!(await changePassword.run())) {
      if (changePassword.error) toast.error('Could not update password', changePassword.error)
      return
    }
    setPassword('')
    setConfirm('')
    toast.success('Password updated')
  }

  // --- danger zone ------------------------------------------------------------
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const deleteAccount = useAction(async () => {
    await profilesService.deleteOwnAccount()
    await signOut().catch(() => undefined)
    return true as const
  })

  const onDeleteAccount = async () => {
    if (!(await deleteAccount.run())) {
      setConfirmingDelete(false)
      if (deleteAccount.error) toast.error('Could not delete account', deleteAccount.error)
      return
    }
    toast.success('Account deleted')
    navigate('/', { replace: true })
  }

  if (!user || !profile) return null

  return (
    <Page
      title="Settings"
      description="Your identity here, your Geometry Dash link, and your account."
      width="narrow"
    >
      <div className="space-y-5">
        <Card title="Profile" description="How you appear to everyone else.">
          <form onSubmit={onSaveProfile} className="space-y-4" noValidate>
            <Input
              label="Username"
              required
              leading={<AtSign className="h-4 w-4" />}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              error={username && !usernameCheck.ok ? usernameCheck.message : null}
              hint={`Your profile URL: /profile/${username || 'username'}`}
            />
            <Input
              label="Display name"
              placeholder={profile.gd_username ?? profile.username}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              hint="Optional. Shown instead of your username."
            />
            <Textarea
              label="Bio"
              value={bio}
              maxLength={280}
              onChange={(event) => setBio(event.target.value)}
              hint={`${bio.length}/280`}
            />

            <Button type="submit" loading={saveProfile.pending} disabled={!profileDirty}>
              Save changes
            </Button>
          </form>
        </Card>

        <Card
          title="Geometry Dash account"
          description="Your stars, moons, demons and icon are read live from Geometry Dash. They are never typed in by hand."
        >
          {profile.gd_username ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-750 bg-ink-850/60 p-4">
                <Avatar
                  src={profilesService.avatarUrl(profile)}
                  name={profile.gd_username}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-semibold text-ink-100">
                    {profile.gd_username}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-400">
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      {formatNumber(profile.gd_stars)}
                    </span>
                    <span>{formatNumber(profile.gd_demons)} demons</span>
                    <span>{formatNumber(profile.gd_moons)} moons</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-600">
                    Account ID {profile.gd_account_id ?? '—'} · synced{' '}
                    {formatRelative(profile.gd_synced_at)}
                  </p>
                </div>
              </div>

              <Button variant="outline" onClick={onUnlink} loading={unlinkGd.pending}>
                <Unlink className="h-4 w-4" aria-hidden="true" />
                Unlink account
              </Button>
            </div>
          ) : (
            <form onSubmit={onLookup} className="space-y-4" noValidate>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input
                  label="Geometry Dash username"
                  placeholder="Your in-game name"
                  leading={<Gamepad2 className="h-4 w-4" />}
                  value={gdInput}
                  onChange={(event) => setGdInput(event.target.value)}
                  containerClassName="flex-1"
                  error={lookupGd.error}
                />
                <Button type="submit" variant="secondary" loading={lookupGd.pending}>
                  Look up
                </Button>
              </div>

              {gdPreview && (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-brand-500/30 bg-brand-500/[0.06] p-4">
                  <Avatar
                    src={gdService.playerIconUrl(gdPreview.username)}
                    name={gdPreview.username}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-semibold text-ink-100">
                      {gdPreview.username}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-400">
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        {formatNumber(gdPreview.stars)}
                      </span>
                      <span>{formatNumber(gdPreview.demons)} demons</span>
                    </p>
                  </div>
                  <Button onClick={onLink} loading={linkGd.pending}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    That&rsquo;s me
                  </Button>
                </div>
              )}

              <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-500">
                <Link2Off className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Geometry Dash has no way to prove you own an account, so this link is taken on
                trust. One account can only be claimed by one member here.
              </p>
            </form>
          )}
        </Card>

        <Card title="Password" description="Change the password you sign in with.">
          <form onSubmit={onChangePassword} className="space-y-4" noValidate>
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              leading={<Lock className="h-4 w-4" />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={password && !passwordCheck.ok ? passwordCheck.message : null}
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              leading={<Lock className="h-4 w-4" />}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              error={confirm && password !== confirm ? 'Those do not match.' : null}
            />
            <Button
              type="submit"
              loading={changePassword.pending}
              disabled={!password || !passwordCheck.ok || password !== confirm}
            >
              Update password
            </Button>
          </form>
        </Card>

        <Card title="Account" description="Your sign-in details.">
          <dl className="space-y-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-ink-400">Email</dt>
              <dd className="font-mono text-ink-200">{user.email}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-ink-400">Member since</dt>
              <dd className="text-ink-200">{formatRelative(profile.created_at)}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-ink-400">Role</dt>
              <dd>{profile.is_admin ? <Badge tone="brand">Admin</Badge> : <span className="text-ink-200">Member</span>}</dd>
            </div>
          </dl>

          <Button
            variant="secondary"
            className="mt-5"
            onClick={async () => {
              await signOut()
              navigate('/')
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </Card>

        <section className="panel border-red-500/25 p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-red-300">Delete account</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-400">
            Permanently removes your profile and every completion you have logged. Levels other
            people have also beaten stay in the catalogue. This cannot be undone.
          </p>
          <Button variant="danger" className="mt-5" onClick={() => setConfirmingDelete(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete my account
          </Button>
        </section>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete your account?"
        message="Your profile and all of your completions will be deleted permanently. There is no undo."
        confirmLabel="Delete forever"
        confirmPhrase={profile.username}
        destructive
        pending={deleteAccount.pending}
        onConfirm={onDeleteAccount}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Page>
  )
}
