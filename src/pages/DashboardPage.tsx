import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gamepad2, Gauge, Heart, Plus, Skull, Star, Trophy } from 'lucide-react'

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button, ButtonLink } from '@/components/ui/Button'
import { StatTile } from '@/components/ui/StatTile'
import { Page, Section } from '@/components/layout/Page'
import { CompletionList } from '@/components/levels/CompletionList'
import { useAction, useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useAppContext } from '@/layouts/AppLayout'
import * as completionsService from '@/services/completions.service'
import * as leaderboardService from '@/services/leaderboard.service'
import { displayNameOf } from '@/services/profiles.service'
import type { CompletionWithLevel } from '@/types/domain'
import { formatNumber, formatRating, ordinal } from '@/utils/format'

export function DashboardPage() {
  const { user, profile } = useAuth()
  const { openAddDemon, dataVersion, bumpDataVersion } = useAppContext()
  const toast = useToast()

  const [pendingDelete, setPendingDelete] = useState<CompletionWithLevel | null>(null)

  const completions = useAsync(
    () => completionsService.listUserCompletions(user!.id),
    [user?.id, dataVersion],
    { enabled: Boolean(user) },
  )

  const board = useAsync(() => leaderboardService.getLeaderboard('completions'), [dataVersion])

  const stats = completionsService.summarise(completions.data ?? [])
  const myRank = leaderboardService.findRank(board.data ?? [], profile?.id)

  const remove = useAction(async (completion: CompletionWithLevel) => {
    await completionsService.deleteCompletion(completion.id)
    return completion
  })

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const removed = await remove.run(pendingDelete)
    setPendingDelete(null)
    if (!removed) return

    toast.success('Removed', `${removed.level.name} is no longer on your profile.`)
    bumpDataVersion()
  }

  if (!user) return null

  const linked = Boolean(profile?.gd_username)

  return (
    <Page
      title={`Welcome back, ${displayNameOf(profile)}`}
      documentTitle="Dashboard"
      description="Everything you have beaten, and where you sit among everyone else."
      actions={
        <Button onClick={() => openAddDemon()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Extreme Demon
        </Button>
      }
    >
      <div className="space-y-10">
        {!linked && (
          <div className="panel flex flex-col items-start gap-4 border-brand-500/25 bg-brand-500/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Gamepad2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink-100">
                  Link your Geometry Dash account
                </p>
                <p className="mt-0.5 text-sm text-ink-400">
                  Your star count, demon count and icon come straight from the game once you do.
                </p>
              </div>
            </div>
            <ButtonLink to="/settings" size="sm" className="shrink-0">
              Link account
            </ButtonLink>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Stars"
            value={linked ? formatNumber(profile?.gd_stars) : '—'}
            detail={linked ? 'from Geometry Dash' : 'link your account'}
            icon={Star}
            tone="brand"
          />
          <StatTile
            label="Extreme Demons"
            value={stats.total}
            detail={stats.withVideo > 0 ? `${stats.withVideo} with video` : 'logged here'}
            icon={Skull}
          />
          <StatTile
            label="Avg enjoyment"
            value={
              <>
                {formatRating(stats.avgEnjoyment)}
                <span className="text-base font-medium text-ink-500"> / 10</span>
              </>
            }
            icon={Heart}
          />
          <StatTile
            label="Your rank"
            value={myRank ? ordinal(myRank.rank) : '—'}
            detail={
              myRank ? (
                <Link to="/leaderboard" className="transition hover:text-brand-400">
                  of {board.data?.length ?? 0} members
                </Link>
              ) : (
                'by demons completed'
              )
            }
            icon={Trophy}
          />
        </div>

        {stats.total > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:hidden">
            <StatTile
              label="Avg difficulty"
              value={formatRating(stats.avgDifficulty)}
              icon={Gauge}
              className="col-span-2"
            />
            <StatTile
              label="Hardest"
              value={stats.bestRank ? `#${stats.bestRank}` : '—'}
              detail="AREDL rank"
              icon={Trophy}
              className="col-span-2"
            />
          </div>
        )}

        <Section
          title="Your Extreme Demons"
          action={
            profile && stats.total > 0 ? (
              <Link
                to={`/profile/${profile.username}`}
                className="text-sm font-semibold text-ink-400 transition hover:text-brand-400"
              >
                View public profile
              </Link>
            ) : null
          }
        >
          <CompletionList
            completions={completions.data ?? []}
            loading={completions.initialLoading}
            emptyTitle="No Extreme Demons logged yet"
            emptyDescription="Add the first one. Enter a level ID and we pull the name, creator, AREDL rank and artwork for you."
            emptyAction={
              <Button onClick={() => openAddDemon()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Extreme Demon
              </Button>
            }
            onEdit={(completion) =>
              openAddDemon({ editing: { completion, level: completion.level } })
            }
            onDelete={setPendingDelete}
          />
        </Section>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove this completion?"
        message={
          pendingDelete
            ? `${pendingDelete.level.name} will be removed from your profile along with your ratings and video. The level itself stays in the catalogue for everyone else.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        pending={remove.pending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Page>
  )
}
