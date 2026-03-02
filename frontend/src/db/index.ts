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
let _workerInstance: Worker | null = null

export function openDb(): Promise<Db> {
  if (!_browserDbPromise) {
    _browserDbPromise = _openDb()
  }
  return _browserDbPromise
}

/**
 * Forcefully terminate the PGlite worker thread. Call this after db.close()
 * resolves and before location.reload() to ensure the worker's OPFS leader
 * lock is released before the new page's worker tries to acquire it.
 */
export function terminateDbWorker(): void {
  if (_workerInstance) {
    _workerInstance.terminate()
    _workerInstance = null
  }
  _browserDbPromise = null
}

async function _openDb(): Promise<Db> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error(
      'This browser does not support OPFS storage. Please use Chrome 102+, Firefox 111+, or Safari 15.2+.',
    )
  }

  // coi-serviceworker installs on the first load after site data is cleared,
  // then immediately reloads the page with COOP/COEP headers. During that brief
  // first load, crossOriginIsolated is false and SharedArrayBuffer is unavailable.
  // Starting PGlite on that transient load races with the reload and causes
  // "Leader changed" / "No more file handles available" errors. Bail out here
  // and let the DbProvider surface the graceful "unavailable" message; the
  // service-worker reload will bring up a clean, isolated page a moment later.
  if (!crossOriginIsolated) {
    throw new Error(
      'Page is not cross-origin isolated (COOP/COEP headers missing). ' +
        'The service worker is installing — the page will reload automatically.',
    )
  }

  const t0 = performance.now()
  console.log('[cardb/db] Starting PGlite initialization…')

  const { PGliteWorker } = await import('@electric-sql/pglite/worker')
  console.log(`[cardb/db] Module imported in ${(performance.now() - t0).toFixed(0)}ms`)

  // Retry loop: after a page reload the previous worker's OPFS leader lock or
  // sync access handles may not be fully released yet. We try up to 3 times
  // with increasing back-off. Each attempt races waitReady against a 8 s
  // timeout so a stuck worker surfaces as an error instead of an infinite hang.
  const MAX_ATTEMPTS = 3
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delayMs = attempt * 1000
      console.warn(`[cardb/db] Retrying PGlite init in ${delayMs}ms (attempt ${attempt + 1})…`)
      await new Promise((r) => setTimeout(r, delayMs))
    }

    _workerInstance = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })
    // The worker itself initializes PGlite with opfs-ahp://cardb
    const db = new PGliteWorker(_workerInstance)

    try {
      await Promise.race([
        db.waitReady,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('PGlite waitReady timed out — OPFS lock not released')),
            8000,
          ),
        ),
      ])
      await applyMigrations(db as unknown as Db)
      console.log(
        `[cardb/db] DB ready in ${(performance.now() - t0).toFixed(0)}ms total (worker+WASM+migrations)`,
      )
      return db as unknown as Db
    } catch (err) {
      lastErr = err
      console.warn(`[cardb/db] Attempt ${attempt + 1} failed:`, err)
      _workerInstance.terminate()
      _workerInstance = null
    }
  }
  throw lastErr
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
