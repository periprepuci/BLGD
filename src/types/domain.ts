/**
 * Application-level types.
 *
 * These are deliberately separate from `database.ts`: the DB types describe
 * rows, these describe the shapes the UI actually renders (rows joined with
 * their relations, plus the normalised results of the external APIs).
 */

import type { CompletionRow, GdIcon, LeaderboardRow, LevelRow, ProfileRow } from './database'

// ---------------------------------------------------------------------------
// Joined read models
// ---------------------------------------------------------------------------

/** A completion together with the level it refers to. */
export interface CompletionWithLevel extends CompletionRow {
  level: LevelRow
}

/** A completion together with the player who logged it. */
export interface CompletionWithProfile extends CompletionRow {
  profile: Pick<
    ProfileRow,
    'id' | 'username' | 'display_name' | 'gd_username' | 'gd_account_id' | 'gd_icon'
  >
}

/** A completion with both sides joined - used on the home feed. */
export interface CompletionWithLevelAndProfile extends CompletionWithLevel {
  profile: CompletionWithProfile['profile']
}

export interface LevelWithStats extends LevelRow {
  completions_count: number
  avg_enjoyment: number | null
  avg_difficulty: number | null
}

export interface ProfileSummary extends LeaderboardRow {}

// ---------------------------------------------------------------------------
// External API - normalised shapes
// ---------------------------------------------------------------------------

/**
 * A Geometry Dash level as our app understands it, independent of which
 * provider produced it. See `services/geometryDash.service.ts`.
 */
export interface GdLevel {
  gdLevelId: number
  name: string
  creator: string | null
  accountId: number | null
  playerId: number | null
  difficulty: string | null
  length: string | null
  songName: string | null
  downloads: number | null
  likes: number | null
  description: string | null
  /** True when the provider reports this level as an Extreme Demon. */
  isExtremeDemon: boolean
}

/** A Geometry Dash player profile, normalised. */
export interface GdPlayer {
  username: string
  accountId: number | null
  playerId: number | null
  stars: number | null
  moons: number | null
  diamonds: number | null
  demons: number | null
  /** Classic Extreme Demons completed in game. */
  extremeDemons: number | null
  icon: GdIcon | null
}

/** One entry of the AREDL ranking, normalised. */
export interface AredlEntry {
  gdLevelId: number
  aredlId: string | null
  name: string
  position: number
  status: string | null
  points: number | null
  gddlTier: number | null
  twoPlayer: boolean
  tags: string[]
  description: string | null
}

/** Extra AREDL detail that only the per-level endpoint returns. */
export interface AredlLevelDetail extends AredlEntry {
  creators: string[]
  publisher: string | null
  verificationVideoUrl: string | null
}

/**
 * Everything the "Add Extreme Demon" preview needs, assembled from the GD
 * provider and AREDL. `source` records where each half actually came from so
 * the UI can be honest about partial data instead of silently inventing it.
 */
export interface ResolvedLevel {
  gdLevelId: number
  name: string
  creator: string | null
  creators: string[]
  accountId: number | null
  playerId: number | null
  difficulty: string | null
  length: string | null
  songName: string | null
  downloads: number | null
  likes: number | null
  description: string | null
  isExtremeDemon: boolean

  aredlId: string | null
  aredlRank: number | null
  aredlStatus: 'MainList' | 'Legacy' | null
  aredlPoints: number | null
  gddlTier: number | null
  tags: string[]

  verificationVideoUrl: string | null
  thumbnailUrl: string | null

  source: {
    gd: 'edge' | 'direct' | 'cache' | 'unavailable'
    aredl: 'edge' | 'direct' | 'cache' | 'mirror' | 'unavailable'
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export type CompletionSortKey =
  | 'aredl_rank'
  | 'completed_at'
  | 'enjoyment'
  | 'difficulty'
  | 'name'

export type SortDirection = 'asc' | 'desc'

export type LeaderboardMetric =
  | 'points'
  | 'completions'
  | 'enjoyment'
  | 'difficulty'
  | 'stars'

export interface SortState {
  key: CompletionSortKey
  direction: SortDirection
}
