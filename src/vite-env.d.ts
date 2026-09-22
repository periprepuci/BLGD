/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SITE_NAME?: string
  readonly VITE_AREDL_API_BASE?: string
  readonly VITE_GD_API_BASE?: string
  readonly VITE_DATA_MODE?: string
  readonly VITE_BASE_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
