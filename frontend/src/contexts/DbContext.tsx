/**
 * DbContext — provides the PGlite database handle to the React tree.
 *
 * Initializes in the background — the app renders immediately while this runs.
 * Timing is logged to the console to help diagnose slow startup.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Db } from '../db/index'

export type DbStatus =
  | 'initializing'  // worker starting, WASM loading
  | 'ready'         // migrations applied, queries possible
  | 'error'         // init failed; app continues in YAML-only mode

interface DbContextValue {
  db: Db | null
  dbStatus: DbStatus
  dbError: string | null
  /** True once DB init has settled (ready or error). Kept for compat. */
  dbReady: boolean
}

const DbContext = createContext<DbContextValue>({
  db: null,
  dbStatus: 'initializing',
  dbError: null,
  dbReady: false,
})

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null)
  const [dbStatus, setDbStatus] = useState<DbStatus>('initializing')
  const [dbError, setDbError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let dbInstance: Db | null = null

    async function init() {
      try {
        const { openDb } = await import('../db/index')
        dbInstance = await openDb()

        if (!cancelled) {
          // Expose for the __cardbResetDb() debug helper
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(window as any).__cardbDb = dbInstance
          setDb(dbInstance)
          setDbStatus('ready')
        }
        // Do NOT close when cancelled — openDb() is a singleton; closing it
        // during StrictMode's unmount would kill the shared worker.
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[cardb/db] Init failed: ${msg}`)
        if (!cancelled) {
          setDbError(msg)
          setDbStatus('error')
        }
      }
    }

    void init()

    return () => {
      cancelled = true
      // Do NOT close dbInstance here. openDb() is a module-level singleton;
      // closing it during StrictMode's unmount/remount cycle would kill the
      // shared worker and trigger PGlite leader-election errors on remount.
      // The worker lives for the full page lifetime and is closed by
      // __cardbResetDb() or the browser when the tab is closed.
    }
  }, [])

  return (
    <DbContext.Provider
      value={{ db, dbStatus, dbError, dbReady: dbStatus !== 'initializing' }}
    >
      {children}
    </DbContext.Provider>
  )
}

export function useDb(): DbContextValue {
  return useContext(DbContext)
}
