import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, UserX } from 'lucide-react'

import { Button, ButtonLink } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ProfileHeaderSkeleton, LevelCardSkeletonList } from '@/components/ui/Skeleton'
import { Page, Section } from '@/components/layout/Page'
import { CompletionList } from '@/components/levels/CompletionList'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { useAction, useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useAppContext } from '@/layouts/AppLayout'
import * as completionsService from '@/services/completions.service'
import * as leaderboardService from '@/services/leaderboard.service'
import * as profilesService from '@/services/profiles.service'
import type { ProfileRow } from '@/types/database'
import type { CompletionWithLevel } from '@/types/domain'

export function ProfilePage() {
  const { username = '' } = useParams<{ username: string }>()
  const { user, setProfile: setOwnProfile } = useAuth()
  const { openAddDemon, dataVersion, bumpDataVersion } = useAppContext()
  const toast = useToast()

  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CompletionWithLevel | null>(null)

  const profileQuery = useAsync(
    () => profilesService.getProfileByUsername(username),
    [username],
  )

  useEffect(() => {
    if (profileQuery.data) setProfile(profileQuery.data)
  }, [profileQuery.data])

  const isOwnProfile = Boolean(user && profile && user.id === profile.id)

  const completions = useAsync(
    () => completionsService.listUserCompletions(profile!.id),
    [profile?.id, dataVersion],
    { enabled: Boolean(profile) },
  )

  const board = useAsync(() => leaderboardService.getLeaderboard('completions'), [dataVersion])

  /**
   * Opening a profile refreshes its Geometry Dash stats, but only when they are
   * older than the TTL - so browsing five profiles is at most five cheap reads
   * from our own database, not five calls to the provider (requirement 15).
   */
  useEffect(() => {
    if (!profile) return
    let active = true

    void profilesService
      .syncGdStats(profile, { currentUserId: user?.id ?? null })
      .then(({ profile: updated, refreshed }) => {
        if (!active || !refreshed) return
        setProfile(updated)
        if (user?.id === updated.id) setOwnProfile(updated)
      })

    return () => {
      active = false
    }
    // Deliberately keyed on the id: re-running on every `profile` change would
    // loop, because a successful sync replaces the object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, user?.id])

  const refreshStats = useAction(async () => {
    if (!profile) return null
    const { profile: updated, refreshed } = await profilesService.syncGdStats(profile, {
      force: true,
      currentUserId: user?.id ?? null,
    })

    setProfile(updated)
    if (user?.id === updated.id) setOwnProfile(updated)

    if (!refreshed) {
      throw new Error(
        isOwnProfile
          ? 'Geometry Dash could not be reached. Try again in a moment.'
          : 'Refreshing another member’s stats needs the sync-gd-profile Edge Function deployed.',
      )
    }
    return updated
  })

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

  const onRefreshStats = async () => {
    const updated = await refreshStats.run()
    if (updated) toast.success('Stats refreshed')
    else if (refreshStats.error) toast.error('Could not refresh', refreshStats.error)
  }

  // --- states ---------------------------------------------------------------

  if (profileQuery.initialLoading) {
    return (
      <Page title="Profile" description="Loading…">
        <div className="space-y-8">
          <ProfileHeaderSkeleton />
          <LevelCardSkeletonList count={3} />
        </div>
      </Page>
    )
  }

  if (profileQuery.error) {
    return (
      <Page title="Profile">
        <ErrorState message={profileQuery.error} action={<ButtonLink to="/">Go home</ButtonLink>} />
      </Page>
    )
  }

  if (!profile) {
    return (
      <Page title="Profile not found" documentTitle="Not found">
        <EmptyState
          icon={UserX}
          title={`No member called “${username}”`}
          description="Check the spelling, or head to the leaderboard to see who is here."
          action={<ButtonLink to="/leaderboard">View leaderboard</ButtonLink>}
        />
      </Page>
    )
  }

  const stats = completionsService.summarise(completions.data ?? [])
  const rank = leaderboardService.findRank(board.data ?? [], profile.id)

  return (
    <Page
      title={profilesService.displayNameOf(profile)}
      documentTitle={`@${profile.username}`}
      description={null}
      className="pt-6"
      actions={
        isOwnProfile ? (
          <Button onClick={() => openAddDemon()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Extreme Demon
          </Button>
        ) : null
      }
    >
      <div className="space-y-8">
        <ProfileHeader
          profile={profile}
          stats={stats}
          leaderboardRank={rank?.rank ?? null}
          isOwnProfile={isOwnProfile}
          onRefreshStats={onRefreshStats}
          refreshing={refreshStats.pending}
        />

        <Section title="Completed Extreme Demons">
          <CompletionList
            completions={completions.data ?? []}
            loading={completions.initialLoading}
            emptyTitle={
              isOwnProfile ? 'You have not logged anything yet' : 'Nothing logged yet'
            }
            emptyDescription={
              isOwnProfile
                ? 'Add your first Extreme Demon and it will show up here.'
                : `${profilesService.displayNameOf(profile)} has not added any Extreme Demons.`
            }
            emptyAction={
              isOwnProfile ? (
                <Button onClick={() => openAddDemon()}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Extreme Demon
                </Button>
              ) : null
            }
            onEdit={
              isOwnProfile
                ? (completion) => openAddDemon({ editing: { completion, level: completion.level } })
                : undefined
            }
            onDelete={isOwnProfile ? setPendingDelete : undefined}
          />
        </Section>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove this completion?"
        message={
          pendingDelete
            ? `${pendingDelete.level.name} will be removed from your profile along with your ratings and video.`
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
