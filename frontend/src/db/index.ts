import { MIGRATIONS } from './migrations'

// ---------------------------------------------------------------------------
// Db interface — structural type that PGlite and PGliteWorker both satisfy
// ---------------------------------------------------------------------------

export interface Db {
  // T is unconstrained so callers can use specific row-shape interfaces
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<{ rows: unknown[] }[]>
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}

// ---------------------------------------------------------------------------
// Schema migration runner
// ---------------------------------------------------------------------------

const SCHEMA_MIGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`

export async function applyMigrations(db: Db): Promise<void> {
  await db.exec(SCHEMA_MIGRATIONS_DDL)

  const { rows } = await db.query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  )
  const applied = new Set(rows.map((r) => r.version))

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue
    await db.transaction(async (tx) => {
      await tx.exec(m.sql)
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version])
    })
  }
}

// ---------------------------------------------------------------------------
// Open production DB (PGliteWorker + OPFS, browser only)
// ---------------------------------------------------------------------------

// Module-level singleton — prevents double-open under React StrictMode.
// StrictMode mounts → unmounts → remounts providers, so without this,
// two concurrent openDb() calls race to open the same OPFS database and
// PGlite's leader election throws "Leader changed" errors.
let _browserDbPromise: Promise<Db> | null = null

export function openDb(): Promise<Db> {
  if (!_browserDbPromise) {
    _browserDbPromise = _openDb()
  }
  return _browserDbPromise
}

async function _openDb(): Promise<Db> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error(
      'This browser does not support OPFS storage. Please use Chrome 102+, Firefox 111+, or Safari 15.2+.',
    )
  }

  const t0 = performance.now()
  console.log('[cardb/db] Starting PGlite initialization…')

  const { PGliteWorker } = await import('@electric-sql/pglite/worker')
  console.log(`[cardb/db] Module imported in ${(performance.now() - t0).toFixed(0)}ms`)

  const workerInstance = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  })
  // The worker itself initializes PGlite with opfs-ahp://cardb — no options needed here
  const db = new PGliteWorker(workerInstance)
  await db.waitReady
  await applyMigrations(db as unknown as Db)
  console.log(
    `[cardb/db] DB ready in ${(performance.now() - t0).toFixed(0)}ms total (worker+WASM+migrations)`,
  )
  return db as unknown as Db
}

// ---------------------------------------------------------------------------
// Open in-memory DB (tests and SSR-safe fallback)
// ---------------------------------------------------------------------------

export async function openTestDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  await db.waitReady
  await applyMigrations(db as unknown as Db)
  return db as unknown as Db
}
