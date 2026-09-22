import { useCallback, useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'

import { Navbar } from '@/components/layout/Navbar'
import { AddDemonModal } from '@/components/levels/AddDemonModal'
import { useAuth } from '@/hooks/useAuth'
import { env } from '@/lib/env'
import type { CompletionRow, LevelRow } from '@/types/database'

export interface AppOutletContext {
  /** Opens the add/edit modal. Pages call this from their own buttons. */
  openAddDemon: (options?: {
    editing?: { completion: CompletionRow; level: LevelRow }
    gdLevelId?: number
  }) => void
  /** Bumped every time a completion is created, edited or deleted. */
  dataVersion: number
  bumpDataVersion: () => void
}

export function useAppContext(): AppOutletContext {
  return useOutletContext<AppOutletContext>()
}

/**
 * The shell every page renders inside.
 *
 * The add/edit modal lives here rather than in each page so that the navbar
 * button, the dashboard button and the level page's "I beat this" all open the
 * same instance - and so that one `dataVersion` counter can tell every mounted
 * page to refetch after a save.
 */
export function AppLayout() {
  const { user } = useAuth()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<{ completion: CompletionRow; level: LevelRow } | null>(null)
  const [presetLevelId, setPresetLevelId] = useState<number | null>(null)
  const [dataVersion, setDataVersion] = useState(0)

  const bumpDataVersion = useCallback(() => setDataVersion((value) => value + 1), [])

  const openAddDemon = useCallback<AppOutletContext['openAddDemon']>((options) => {
    setEditing(options?.editing ?? null)
    setPresetLevelId(options?.gdLevelId ?? null)
    setModalOpen(true)
  }, [])

  const context: AppOutletContext = { openAddDemon, dataVersion, bumpDataVersion }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar onAddDemon={user ? () => openAddDemon() : undefined} />

      <main className="flex-1">
        <Outlet context={context} />
      </main>

      <footer className="safe-bottom mt-16 border-t border-ink-800/70 py-8">
        <div className="mx-auto flex max-w-[110rem] flex-col gap-2 px-4 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            {env.siteName} — a private Extreme Demon log. Not affiliated with AREDL, GDBrowser or
            RobTop Games.
          </p>
          <p>
            Rankings from{' '}
            <a
              href="https://aredl.net"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-400 underline-offset-2 transition hover:text-brand-400 hover:underline"
            >
              AREDL
            </a>
            {' · '}
            Level and player data from{' '}
            <a
              href="https://gdbrowser.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-400 underline-offset-2 transition hover:text-brand-400 hover:underline"
            >
              GDBrowser
            </a>
          </p>
        </div>
      </footer>

      {user && (
        <AddDemonModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          userId={user.id}
          editing={editing}
          initialGdLevelId={presetLevelId}
          onSaved={bumpDataVersion}
        />
      )}
    </div>
  )
}
