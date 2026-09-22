import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Builds the smoke test with Vite rather than running it with ts-node, so that
 * `import.meta.env` and the `@` alias resolve exactly as they do in the app.
 * The output is a plain Node ESM bundle that `run.mjs` executes.
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  logLevel: 'warn',
  build: {
    ssr: true,
    outDir: fileURLToPath(new URL('./out', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./smoke.ts', import.meta.url)) },
  },
})
