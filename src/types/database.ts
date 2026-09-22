/**
 * NOTE: every row shape below is a `type`, not an `interface`, on purpose.
 * postgrest-js constrains Row/Insert/Update to `Record<string, unknown>`, and
 * only type aliases get an implicit index signature in TypeScript. Declaring
 * one of these as an interface makes the whole `Database` type fail that
 * constraint, and every query result silently becomes `never`.
 *
 * Hand-written mirror of `supabase/migrations/20260922000000_initial_schema.sql`.
 *
 * It is kept by hand rather than generated so that the repo has no dependency
 * on the Supabase CLI just to typecheck. If you change the schema, change this
 * file in the same commit - or regenerate it with:
 *
 *   supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type GdIcon = {
  icon?: number
  ship?: number
  ball?: number
  ufo?: number
  wave?: number
  robot?: number
  spider?: number
  swing?: number
  col1?: number
  col2?: number
  colG?: number
  glow?: boolean
}

export type ProfileRow = {
  id: string
  username: string
  username_key: string
  display_name: string | null
  bio: string | null
  gd_username: string | null
  gd_account_id: number | null
  gd_player_id: number | null
  gd_stars: number | null
  gd_moons: number | null
  gd_diamonds: number | null
  gd_demons: number | null
  /** Classic Extreme Demons completed in Geometry Dash. Classic only: AREDL is
   *  a classic-mode list, so a platformer extreme could never be on it. */
  gd_extreme_demons: number | null
  gd_icon: GdIcon | null
  gd_synced_at: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | 'username'
    | 'display_name'
    | 'bio'
    | 'gd_username'
    | 'gd_account_id'
    | 'gd_player_id'
    | 'gd_stars'
    | 'gd_moons'
    | 'gd_diamonds'
    | 'gd_demons'
    | 'gd_extreme_demons'
    | 'gd_icon'
    | 'gd_synced_at'
  >
>

export type LevelRow = {
  id: string
  gd_level_id: number
  name: string
  creator: string | null
  creators: string[]
  gd_account_id: number | null
  gd_player_id: number | null
  difficulty: string | null
  length: string | null
  song_name: string | null
  downloads: number | null
  likes: number | null
  aredl_id: string | null
  aredl_rank: number | null
  aredl_status: 'MainList' | 'Legacy' | null
  aredl_points: number | null
  gddl_tier: number | null
  tags: string[]
  description: string | null
  verification_video_url: string | null
  thumbnail_url: string | null
  aredl_synced_at: string | null
  gd_synced_at: string | null
  created_at: string
  updated_at: string
}

export type LevelInsert = Omit<LevelRow, 'id' | 'created_at' | 'updated_at'> &
  Partial<Pick<LevelRow, 'id'>>

export type CompletionRow = {
  id: string
  user_id: string
  level_id: string
  enjoyment: number | null
  difficulty: number | null
  youtube_url: string | null
  youtube_video_id: string | null
  note: string | null
  completed_at: string
  created_at: string
  updated_at: string
}

export type CompletionInsert = Omit<CompletionRow, 'id' | 'created_at' | 'updated_at'>
export type CompletionUpdate = Partial<
  Pick<
    CompletionRow,
    'enjoyment' | 'difficulty' | 'youtube_url' | 'youtube_video_id' | 'note' | 'completed_at'
  >
>

export type AredlLevelRow = {
  /** AREDL's own id for a list entry. Two entries can share a gd_level_id. */
  aredl_id: string
  gd_level_id: number
  name: string
  position: number
  status: string | null
  points: number | null
  gddl_tier: number | null
  two_player: boolean
  tags: string[]
  description: string | null
  synced_at: string
}

export type LeaderboardRow = {
  id: string
  username: string
  display_name: string | null
  gd_username: string | null
  gd_account_id: number | null
  gd_stars: number | null
  gd_demons: number | null
  gd_moons: number | null
  gd_icon: GdIcon | null
  gd_extreme_demons: number | null
  completions_count: number
  /** Completions that really are Extreme Demons - comparable to gd_extreme_demons. */
  extreme_completions_count: number
  avg_enjoyment: number | null
  avg_difficulty: number | null
  best_aredl_rank: number | null
  last_completion_at: string | null
  /** Beaten in game but not logged here. NULL when no account is linked. */
  missing_extreme_demons: number | null
}

export type LevelStatsRow = {
  level_id: string
  completions_count: number
  avg_enjoyment: number | null
  avg_difficulty: number | null
}

export type SyncRunRow = {
  id: string
  kind: string
  status: 'ok' | 'error'
  levels_seen: number | null
  levels_updated: number | null
  message: string | null
  duration_ms: number | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: Pick<ProfileRow, 'id' | 'username'> & ProfileUpdate
        Update: ProfileUpdate
        Relationships: []
      }
      levels: {
        Row: LevelRow
        Insert: LevelInsert
        Update: Partial<LevelInsert>
        Relationships: []
      }
      completions: {
        Row: CompletionRow
        Insert: CompletionInsert
        Update: CompletionUpdate
        Relationships: []
      }
      aredl_levels: {
        Row: AredlLevelRow
        Insert: AredlLevelRow
        Update: Partial<AredlLevelRow>
        Relationships: []
      }
      sync_runs: {
        Row: SyncRunRow
        Insert: Omit<SyncRunRow, 'id' | 'created_at'>
        Update: Partial<Omit<SyncRunRow, 'id' | 'created_at'>>
        Relationships: []
      }
    }
    Views: {
      leaderboard: { Row: LeaderboardRow; Relationships: [] }
      level_stats: { Row: LevelStatsRow; Relationships: [] }
      /** One row per Geometry Dash level: the solo listing wins over the 2P one. */
      aredl_canonical: { Row: AredlLevelRow; Relationships: [] }
    }
    Functions: {
      is_admin: { Args: { uid?: string }; Returns: boolean }
      delete_own_account: { Args: Record<string, never>; Returns: undefined }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
