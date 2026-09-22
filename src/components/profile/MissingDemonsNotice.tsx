import { AlertCircle, CheckCircle2, Plus } from 'lucide-react'

import { Button, ButtonLink } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import { finiteOrNull, pluralize } from '@/utils/format'

export interface MissingDemonsNoticeProps {
  /**
   * Beaten in Geometry Dash, from the provider. Null when no account is linked,
   * and typed `unknown` because a database that has not run the latest
   * migration omits the column entirely, delivering `undefined`.
   */
  inGame: unknown
  /** Logged on this site. */
  logged: number
  /** Whose profile this is, for the third-person wording. */
  displayName: string
  isOwnProfile: boolean
  onAdd?: () => void
  className?: string
}

/**
 * The gap between "beaten in Geometry Dash" and "logged here".
 *
 * The in-game figure is `classicDemonsCompleted.extreme` from the Geometry Dash
 * provider - a number nobody here can type in. Comparing it with the
 * completions on file turns the site from a list you maintain by memory into
 * one that tells you what you have forgotten.
 *
 * Deliberately quiet when there is nothing to do, and silent when there is no
 * linked account: without one the question has no answer, and "0 missing"
 * would be a lie dressed as reassurance.
 */
export function MissingDemonsNotice({
  inGame,
  logged,
  displayName,
  isOwnProfile,
  onAdd,
  className,
}: MissingDemonsNoticeProps) {
  const beaten = finiteOrNull(inGame)
  if (beaten === null) return null

  const missing = Math.max(0, beaten - logged)

  // Beaten fewer in game than logged here. Happens when someone logs a demon
  // Geometry Dash has not credited yet, or an unrated one. Not worth nagging
  // about, and definitely not worth calling an error.
  if (missing === 0) {
    if (logged === 0) return null
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3',
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <p className="text-sm text-ink-300">
          {isOwnProfile ? 'You have' : `${displayName} has`} logged{' '}
          <span className="font-semibold text-ink-100">
            all {beaten} Extreme {pluralize(beaten, 'Demon')}
          </span>{' '}
          beaten in Geometry Dash.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'panel flex flex-col gap-4 border-brand-500/25 bg-brand-500/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-ink-100">
            {missing} Extreme {pluralize(missing, 'Demon')} missing from{' '}
            {isOwnProfile ? 'your profile' : `${displayName}'s profile`}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-400">
            Geometry Dash says {isOwnProfile ? 'you have' : 'they have'} beaten{' '}
            <span className="text-ink-200">{beaten}</span>, and{' '}
            <span className="text-ink-200">{logged}</span>{' '}
            {logged === 1 ? 'is' : 'are'} logged here.
          </p>
        </div>
      </div>

      {isOwnProfile ? (
        onAdd && (
          <Button onClick={onAdd} className="shrink-0">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add {pluralize(missing, 'the missing one', 'the missing ones')}
          </Button>
        )
      ) : (
        <ButtonLink to="/aredl" variant="outline" size="sm" className="shrink-0">
          Browse AREDL
        </ButtonLink>
      )}
    </div>
  )
}
