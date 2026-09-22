/**
 * Runs the built smoke test under Node.
 *
 * Usage:  npm run smoke
 *
 * Hits the live AREDL and Geometry Dash APIs. Needs no Supabase project and no
 * environment variables: with Supabase unconfigured the services take their
 * "direct" fallback path, which is exactly what this is meant to exercise.
 */
// localStorage shim: the cache layer persists there in the browser. Node has no
// such global, and the cache is written to degrade gracefully - this proves it.
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size },
}
await import('./out/smoke.js')
