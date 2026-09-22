import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The app is deployed to GitHub Pages, which serves a project site from a
 * sub-path (https://<user>.github.io/<repo>/). Vite needs to know that
 * sub-path at build time so asset URLs resolve. The GitHub Actions workflow
 * sets VITE_BASE_PATH from the repository name; locally it stays "/".
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBase = env.VITE_BASE_PATH?.trim() || '/'
  const base = rawBase === '/' ? '/' : `/${rawBase.replace(/^\/+|\/+$/g, '')}/`

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: false,
    },
  }
})
