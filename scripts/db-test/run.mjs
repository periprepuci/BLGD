/**
 * Runs the Row Level Security test suite against a throwaway PostgreSQL
 * database.
 *
 *   npm run test:db
 *
 * It creates a fresh database, applies a Supabase-alike bootstrap (the `auth`
 * schema, the three roles, and Supabase's default table privileges), applies
 * the real migration unmodified, and then asserts that one member cannot touch
 * another member's data.
 *
 * Needs a running PostgreSQL that `psql` can reach. Point it at one with the
 * standard libpq variables, e.g.:
 *
 *   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... npm run test:db
 *
 * It does NOT need Supabase, Docker, or network access.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')

const MIGRATION = join(repoRoot, 'supabase', 'migrations', '20260922000000_initial_schema.sql')
const HARNESS = join(here, '00-supabase-harness.sql')
const TESTS = join(here, '02-rls-tests.sql')

const DB = process.env.BLGD_TEST_DB ?? 'blgd_rls_test'

function findPsql() {
  if (process.env.PSQL && existsSync(process.env.PSQL)) return process.env.PSQL

  const candidates = [
    'psql',
    ...[18, 17, 16, 15, 14].map((v) => `C:/Program Files/PostgreSQL/${v}/bin/psql.exe`),
    '/usr/bin/psql',
    '/usr/local/bin/psql',
    '/opt/homebrew/bin/psql',
  ]

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' })
      return candidate
    } catch {
      /* try the next one */
    }
  }
  return null
}

const psql = findPsql()
if (!psql) {
  console.error('psql not found. Install PostgreSQL, or set PSQL to its path.')
  process.exit(2)
}

const baseArgs = ['-v', 'ON_ERROR_STOP=1', '--no-psqlrc', '-q']

function run(args, { capture = false } = {}) {
  return execFileSync(psql, [...baseArgs, ...args], {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  })
}

console.log(`psql:     ${psql}`)
console.log(`database: ${DB}`)
console.log()

try {
  // A fresh database every run, so a half-finished previous run cannot make
  // the suite pass by accident.
  run(['-d', 'postgres', '-c', `drop database if exists ${DB} with (force)`], { capture: true })
  run(['-d', 'postgres', '-c', `create database ${DB}`], { capture: true })

  run(['-d', DB, '-f', HARNESS], { capture: true })
  console.log('harness   applied (auth schema, roles, default privileges)')

  run(['-d', DB, '-f', MIGRATION], { capture: true })
  console.log('migration applied')
  console.log()

  run(['-d', DB, '-f', TESTS])

  console.log()
  console.log('RLS TEST SUITE PASSED')
  process.exit(0)
} catch (error) {
  const stderr = error.stderr?.toString?.() ?? ''
  const stdout = error.stdout?.toString?.() ?? ''
  if (stdout) console.log(stdout)
  if (stderr) console.error(stderr)
  console.error('\nRLS TEST SUITE FAILED')
  process.exit(1)
}
