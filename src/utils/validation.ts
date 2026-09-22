/**
 * Input validation shared by the forms and the service layer.
 *
 * Everything here is also enforced by a CHECK constraint or an RLS policy in
 * Postgres - this layer exists to give a good error message before the round
 * trip, not to be the only guard.
 */

import { extractYouTubeId } from './youtube'

export const RATING_MIN = 0
export const RATING_MAX = 10
/**
 * Rating granularity. See README, "Rating scale": 0-10 in steps of 0.5.
 * 21 distinct values is enough resolution to say "this was a 7.5, not an 8"
 * without turning every entry into an agonising decision.
 */
export const RATING_STEP = 0.5

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/

export interface FieldResult {
  ok: boolean
  message?: string
}

const OK: FieldResult = { ok: true }

export function validateUsername(value: string): FieldResult {
  const v = value.trim()
  if (!v) return { ok: false, message: 'Pick a username.' }
  if (v.length < 3) return { ok: false, message: 'At least 3 characters.' }
  if (v.length > 24) return { ok: false, message: 'At most 24 characters.' }
  if (!USERNAME_PATTERN.test(v)) {
    return { ok: false, message: 'Letters, numbers, and . _ - only.' }
  }
  return OK
}

export function validateEmail(value: string): FieldResult {
  const v = value.trim()
  if (!v) return { ok: false, message: 'Enter your email.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { ok: false, message: 'That email looks off.' }
  return OK
}

export function validatePassword(value: string): FieldResult {
  if (!value) return { ok: false, message: 'Enter a password.' }
  // Supabase rejects anything shorter than 6 server-side; we ask for 8.
  if (value.length < 8) return { ok: false, message: 'At least 8 characters.' }
  if (value.length > 72) return { ok: false, message: 'At most 72 characters.' }
  return OK
}

/** Geometry Dash level ids are positive integers; current ones are 8-9 digits. */
export function parseLevelId(value: string): number | null {
  const v = value.trim().replace(/^#/, '')
  if (!/^\d{1,12}$/.test(v)) return null
  const n = Number(v)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export function validateLevelId(value: string): FieldResult {
  if (!value.trim()) return { ok: false, message: 'Enter a level ID.' }
  return parseLevelId(value) === null
    ? { ok: false, message: 'A level ID is just digits, e.g. 42584142.' }
    : OK
}

export function validateYouTubeUrl(value: string, { required = false } = {}): FieldResult {
  const v = value.trim()
  if (!v) return required ? { ok: false, message: 'Paste your completion link.' } : OK
  return extractYouTubeId(v) === null
    ? { ok: false, message: 'Use a youtube.com/watch?v=… or youtu.be/… link.' }
    : OK
}

export function validateRating(value: number): FieldResult {
  if (Number.isNaN(value)) return { ok: false, message: 'Pick a value.' }
  if (value < RATING_MIN || value > RATING_MAX) {
    return { ok: false, message: `Between ${RATING_MIN} and ${RATING_MAX}.` }
  }
  if (Math.round(value / RATING_STEP) * RATING_STEP !== value) {
    return { ok: false, message: `Use steps of ${RATING_STEP}.` }
  }
  return OK
}

/** Snaps an arbitrary number onto the rating scale. */
export function clampRating(value: number): number {
  const clamped = Math.min(RATING_MAX, Math.max(RATING_MIN, value))
  return Math.round(clamped / RATING_STEP) * RATING_STEP
}

export function validateCompletedAt(value: string): FieldResult {
  if (!value) return { ok: false, message: 'Pick a date.' }
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return { ok: false, message: 'That date is not valid.' }
  // Geometry Dash 1.0 shipped 2013-08-13; anything before it is a typo.
  if (date < new Date('2013-08-13T00:00:00')) {
    return { ok: false, message: 'Geometry Dash did not exist yet.' }
  }
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date > tomorrow) return { ok: false, message: 'That date is in the future.' }
  return OK
}

/**
 * Collapses whitespace and strips control characters from free text before it
 * is stored. Output is still rendered as text by React (never as HTML), so this
 * is tidying rather than XSS defence - but it keeps the database clean.
 */
export function sanitizeText(value: string, maxLength: number): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function firstError(...results: FieldResult[]): string | null {
  for (const result of results) {
    if (!result.ok) return result.message ?? 'Invalid value'
  }
  return null
}
