import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Hash, Search, Youtube } from 'lucide-react'

import { Badge, RankBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { RatingSlider } from '@/components/ui/RatingSlider'
import { Skeleton } from '@/components/ui/Skeleton'
import { SmartImage } from '@/components/ui/SmartImage'
import { useAction } from '@/hooks/useAsync'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/hooks/useToast'
import * as completionsService from '@/services/completions.service'
import * as gdService from '@/services/geometryDash.service'
import * as levelsService from '@/services/levels.service'
import type { CompletionRow, LevelRow } from '@/types/database'
import type { GdLevel, ResolvedLevel } from '@/types/domain'
import { cn } from '@/utils/cn'
import { formatCompact, hueFromString } from '@/utils/format'
import {
  parseLevelId,
  validateCompletedAt,
  validateLevelId,
  validateYouTubeUrl,
} from '@/utils/validation'
import { extractYouTubeId, thumbnailUrl } from '@/utils/youtube'

export interface AddDemonModalProps {
  open: boolean
  onClose: () => void
  userId: string
  /** Present when editing: the level is fixed and only ratings can change. */
  editing?: { completion: CompletionRow; level: LevelRow } | null
  /** Pre-fills the level ID, e.g. from a level page's "I beat this" button. */
  initialGdLevelId?: number | null
  onSaved: () => void
}

const today = () => new Date().toISOString().slice(0, 10)

export function AddDemonModal({
  open,
  onClose,
  userId,
  editing = null,
  initialGdLevelId = null,
  onSaved,
}: AddDemonModalProps) {
  const toast = useToast()
  const isEditing = editing !== null

  const [levelIdText, setLevelIdText] = useState('')
  const [resolved, setResolved] = useState<ResolvedLevel | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<GdLevel[]>([])
  const [searching, setSearching] = useState(false)

  const [enjoyment, setEnjoyment] = useState(7.5)
  const [difficulty, setDifficulty] = useState(7.5)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [completedAt, setCompletedAt] = useState(today)
  const [touched, setTouched] = useState(false)

  const lookupToken = useRef(0)

  // --- open / reset ---------------------------------------------------------
  useEffect(() => {
    if (!open) return

    setTouched(false)
    setLookupError(null)
    setSearchTerm('')
    setSearchResults([])

    if (editing) {
      setLevelIdText(String(editing.level.gd_level_id))
      setResolved(null)
      setEnjoyment(editing.completion.enjoyment ?? 7.5)
      setDifficulty(editing.completion.difficulty ?? 7.5)
      setYoutubeUrl(editing.completion.youtube_url ?? '')
      setCompletedAt(editing.completion.completed_at)
    } else {
      setLevelIdText(initialGdLevelId ? String(initialGdLevelId) : '')
      setResolved(null)
      setEnjoyment(7.5)
      setDifficulty(7.5)
      setYoutubeUrl('')
      setCompletedAt(today())
    }
  }, [open, editing, initialGdLevelId])

  // --- level lookup ---------------------------------------------------------
  const debouncedLevelId = useDebounce(levelIdText, 500)

  useEffect(() => {
    if (!open || isEditing) return

    const gdLevelId = parseLevelId(debouncedLevelId)
    if (gdLevelId === null) {
      setResolved(null)
      setLookupError(debouncedLevelId.trim() ? validateLevelId(debouncedLevelId).message ?? null : null)
      return
    }

    const token = ++lookupToken.current
    const controller = new AbortController()

    setLooking(true)
    setLookupError(null)

    levelsService
      .resolveLevel(gdLevelId, controller.signal)
      .then((result) => {
        if (token !== lookupToken.current) return
        setResolved(result)
      })
      .catch((error: unknown) => {
        if (token !== lookupToken.current) return
        setResolved(null)
        setLookupError(error instanceof Error ? error.message : 'Could not look that level up.')
      })
      .finally(() => {
        if (token === lookupToken.current) setLooking(false)
      })

    return () => controller.abort()
  }, [debouncedLevelId, open, isEditing])

  // --- level search by name -------------------------------------------------
  const debouncedSearch = useDebounce(searchTerm, 400)

  useEffect(() => {
    if (!open || isEditing || debouncedSearch.trim().length < 2) {
      setSearchResults([])
      return
    }

    const controller = new AbortController()
    setSearching(true)

    gdService
      .searchLevels(debouncedSearch, { signal: controller.signal, count: 8 })
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false))

    return () => controller.abort()
  }, [debouncedSearch, open, isEditing])

  // --- derived --------------------------------------------------------------
  const preview: {
    name: string
    creator: string | null
    gdLevelId: number
    aredlRank: number | null
    aredlStatus: 'MainList' | 'Legacy' | null
    tags: string[]
    verificationVideoUrl: string | null
    isExtremeDemon: boolean
    downloads: number | null
    likes: number | null
    aredlUnavailable: boolean
  } | null = useMemo(() => {
    if (isEditing && editing) {
      return {
        name: editing.level.name,
        creator: editing.level.creator,
        gdLevelId: editing.level.gd_level_id,
        aredlRank: editing.level.aredl_rank,
        aredlStatus: editing.level.aredl_status,
        tags: editing.level.tags ?? [],
        verificationVideoUrl: editing.level.verification_video_url,
        isExtremeDemon: true,
        downloads: editing.level.downloads,
        likes: editing.level.likes,
        aredlUnavailable: false,
      }
    }
    if (!resolved) return null
    return {
      name: resolved.name,
      creator: resolved.creator,
      gdLevelId: resolved.gdLevelId,
      aredlRank: resolved.aredlRank,
      aredlStatus: resolved.aredlStatus,
      tags: resolved.tags,
      verificationVideoUrl: resolved.verificationVideoUrl,
      isExtremeDemon: resolved.isExtremeDemon,
      downloads: resolved.downloads,
      likes: resolved.likes,
      aredlUnavailable: resolved.source.aredl === 'unavailable',
    }
  }, [isEditing, editing, resolved])

  const ownVideoId = extractYouTubeId(youtubeUrl)
  const previewImage =
    thumbnailUrl(ownVideoId) ??
    thumbnailUrl(extractYouTubeId(preview?.verificationVideoUrl ?? null))

  const youtubeCheck = validateYouTubeUrl(youtubeUrl)
  const dateCheck = validateCompletedAt(completedAt)
  const canSave = Boolean(preview) && youtubeCheck.ok && dateCheck.ok

  // --- save -----------------------------------------------------------------
  const save = useAction(async () => {
    if (isEditing && editing) {
      await completionsService.updateCompletion(editing.completion.id, {
        enjoyment,
        difficulty,
        youtubeUrl,
        completedAt,
      })
      return 'updated' as const
    }

    if (!resolved) throw new Error('Look a level up first.')

    // The catalogue row must exist before the completion can point at it.
    const level = await levelsService.upsertLevel(resolved)
    await completionsService.addCompletion(userId, {
      levelId: level.id,
      enjoyment,
      difficulty,
      youtubeUrl,
      completedAt,
    })
    return 'added' as const
  })

  const onSubmit = async () => {
    setTouched(true)
    if (!canSave) return

    const result = await save.run()
    if (!result) return

    toast.success(
      result === 'added' ? 'Extreme Demon logged' : 'Completion updated',
      preview ? `${preview.name} is on your profile.` : undefined,
    )
    onSaved()
    onClose()
  }

  const hue = hueFromString(preview?.name ?? 'blgd')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit completion' : 'Add Extreme Demon'}
      description={
        isEditing
          ? 'Update your ratings or your completion video.'
          : 'Enter a Geometry Dash level ID and we will pull the level and its AREDL rank.'
      }
      size="lg"
      dismissible={!save.pending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={save.pending} disabled={!canSave}>
            {isEditing ? 'Save changes' : 'Add to profile'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!isEditing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Level ID"
              required
              inputMode="numeric"
              autoComplete="off"
              placeholder="42584142"
              leading={<Hash className="h-4 w-4" />}
              value={levelIdText}
              onChange={(event) => setLevelIdText(event.target.value)}
              error={lookupError}
              hint="The number in the level's Geometry Dash URL."
            />
            <Input
              label="…or search by name"
              autoComplete="off"
              placeholder="Bloodlust"
              leading={<Search className="h-4 w-4" />}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              hint={searching ? 'Searching Geometry Dash…' : 'Extreme Demons only.'}
            />
          </div>
        )}

        {searchResults.length > 0 && (
          <ul className="max-h-52 divide-y divide-ink-800 overflow-y-auto rounded-xl border border-ink-750 bg-ink-900/60">
            {searchResults.map((result) => (
              <li key={result.gdLevelId}>
                <button
                  type="button"
                  onClick={() => {
                    setLevelIdText(String(result.gdLevelId))
                    setSearchTerm('')
                    setSearchResults([])
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-ink-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-100">
                      {result.name}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      by {result.creator ?? 'Unknown'} · {formatCompact(result.downloads)} plays
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.6875rem] text-ink-500">
                    {result.gdLevelId}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* --- preview ------------------------------------------------------ */}
        {looking && !preview && (
          <div className="panel overflow-hidden">
            <Skeleton className="aspect-[21/9] w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        )}

        {preview && (
          <section
            className="overflow-hidden rounded-2xl border border-ink-750 bg-ink-900/70"
            aria-label="Level preview"
          >
            <div className="relative aspect-[21/9] w-full overflow-hidden bg-ink-850">
              <SmartImage
                src={previewImage}
                alt={`${preview.name} preview`}
                fallbacks={[thumbnailUrl(ownVideoId, 'hq')].filter(
                  (value): value is string => Boolean(value),
                )}
                loading="eager"
                placeholder={
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, hsl(${hue} 38% 20%), hsl(${(hue + 35) % 360} 30% 11%))`,
                    }}
                    aria-hidden="true"
                  >
                    <span className="font-display text-5xl font-bold text-white/15">
                      {preview.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                }
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent"
                aria-hidden="true"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="truncate text-xl leading-tight">{preview.name}</h3>
                  <p className="truncate text-sm text-ink-300">
                    by {preview.creator ?? 'Unknown creator'}
                  </p>
                </div>
                <RankBadge rank={preview.aredlRank} status={preview.aredlStatus} size="lg" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-ink-800 px-4 py-3">
              <Badge tone="neutral" className="font-mono">
                ID {preview.gdLevelId}
              </Badge>
              {preview.isExtremeDemon ? (
                <Badge tone="brand">Extreme Demon</Badge>
              ) : (
                <Badge tone="warning">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Not an Extreme Demon
                </Badge>
              )}
              {preview.likes !== null && (
                <Badge tone="neutral">{formatCompact(preview.likes)} likes</Badge>
              )}
              {preview.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} tone="neutral">
                  {tag}
                </Badge>
              ))}
            </div>

            {preview.aredlUnavailable && (
              <p className="border-t border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5 text-xs text-amber-300">
                AREDL could not be reached, so no rank was fetched. The level will still be saved,
                and the next sync will fill the rank in.
              </p>
            )}
            {!preview.aredlUnavailable && preview.aredlRank === null && (
              <p className="border-t border-ink-800 px-4 py-2.5 text-xs text-ink-500">
                This level is not on the AREDL list right now. It will pick up a rank automatically
                if that changes.
              </p>
            )}
          </section>
        )}

        {/* --- ratings ------------------------------------------------------ */}
        <fieldset
          disabled={!preview || save.pending}
          className={cn('space-y-5 transition-opacity', !preview && 'pointer-events-none opacity-40')}
        >
          <legend className="sr-only">Your ratings</legend>

          <div className="grid gap-5 sm:grid-cols-2">
            <RatingSlider
              label="Enjoyment"
              value={enjoyment}
              onChange={setEnjoyment}
              tone="brand"
              hint="How much you liked playing it."
            />
            <RatingSlider
              label="Difficulty"
              value={difficulty}
              onChange={setDifficulty}
              tone="sky"
              hint="How hard it was for you, personally."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Input
              label="YouTube completion"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.youtube.com/watch?v=…"
              leading={<Youtube className="h-4 w-4" />}
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              error={touched ? (youtubeCheck.ok ? null : youtubeCheck.message) : null}
              hint="Optional. Adds a Watch button and uses the video frame as the card art."
            />
            <Input
              label="Completed on"
              type="date"
              max={today()}
              value={completedAt}
              onChange={(event) => setCompletedAt(event.target.value)}
              error={touched ? (dateCheck.ok ? null : dateCheck.message) : null}
              containerClassName="sm:w-44"
            />
          </div>
        </fieldset>

        {save.error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {save.error}
          </p>
        )}
      </div>
    </Modal>
  )
}
