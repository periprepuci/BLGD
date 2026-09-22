/**
 * Typed, validated access to the build-time environment.
 *
 * Everything here is public by definition: Vite inlines `import.meta.env.VITE_*`
 * into the bundle, so these values ship to every visitor. Private keys live
 * only in Supabase Edge Function secrets - see `supabase/functions/`.
 */

const raw = import.meta.env

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

export type DataMode = 'auto' | 'edge' | 'direct'

function dataMode(value: unknown): DataMode {
  return value === 'edge' || value === 'direct' ? value : 'auto'
}

export const env = {
  supabaseUrl: str(raw.VITE_SUPABASE_URL),
  supabaseAnonKey: str(raw.VITE_SUPABASE_ANON_KEY),
  siteName: str(raw.VITE_SITE_NAME, 'BLGD'),
  aredlApiBase: str(raw.VITE_AREDL_API_BASE, 'https://api.aredl.net/v2').replace(/\/+$/, ''),
  gdApiBase: str(raw.VITE_GD_API_BASE, 'https://gdbrowser.com').replace(/\/+$/, ''),
  dataMode: dataMode(raw.VITE_DATA_MODE),
  /** Vite's resolved base path, e.g. "/" locally and "/BLGD/" on Pages. */
  basePath: str(raw.BASE_URL, '/'),
  isDev: Boolean(raw.DEV),
} as const

/**
 * The app needs Supabase to do anything useful. When it is not configured we
 * render a setup screen instead of letting `createClient` throw at import time
 * and leave a blank page behind.
 */
export const isSupabaseConfigured =
  env.supabaseUrl.startsWith('http') && env.supabaseAnonKey.length > 20

/** Absolute URL of the app root, used for auth redirects. */
export function appOrigin(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${env.basePath}`.replace(/\/+$/, '/')
}
