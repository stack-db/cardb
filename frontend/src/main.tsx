import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { DbProvider } from './contexts/DbContext'
import { App } from './App'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'

// ---------------------------------------------------------------------------
// Debug reset helper — usage: __cardbResetDb()
//
// We can't delete the OPFS directory while PGlite's worker holds exclusive
// file locks on it. Instead, we schedule the deletion for the *next* startup
// via sessionStorage, then reload. On reload the browser terminates all
// workers (releasing locks) before this module runs, so the deletion succeeds.
// ---------------------------------------------------------------------------

// On reload after an OPFS-fallback reset, erase the database directory before
// any worker starts (the previous tab's workers are terminated on navigation).
async function applyPendingReset() {
  if (sessionStorage.getItem('cardb_reset') !== '1') return
  sessionStorage.removeItem('cardb_reset')
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('cardb', { recursive: true })
    console.log('[cardb] OPFS database erased.')
  } catch (err) {
    if (!(err instanceof Error) || err.name !== 'NotFoundError') {
      console.warn('[cardb] Deferred reset failed:', err)
    }
  }
}

// Preferred reset path: close the PGlite worker gracefully so it flushes all
// pending OPFS writes and releases its sync access handles, then reload.
// applyPendingReset() runs on the fresh page before any new worker starts and
// can delete the directory without hitting NoModificationAllowedError.
async function resetDb() {
  sessionStorage.setItem('cardb_reset', '1')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (window as any).__cardbDb
  if (db) {
    try {
      await db.close()
    } catch {
      // If close() fails, proceed — location.reload() terminates the worker
      // and the browser releases any remaining OS-level file handles.
    }
  }
  location.reload()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).__cardbResetDb = resetDb

// ---------------------------------------------------------------------------
// Debug helpers — usage from browser console:
//   __cardbMarkDirty()          mark the first (or active) stack as modified
//   __cardbMarkDirty('my-stack') mark the named stack
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).__cardbCheckBackup = async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (window as any).__cardbDb
  if (!db) {
    console.warn('[cardb] DB not ready yet')
    return
  }
  const { listModifiedStacks } = await import('./db/queries/stacks')
  const { getLastBackupTime } = await import('./backup')
  const modified = await listModifiedStacks(db)
  const backupMs = await getLastBackupTime()
  console.log(
    '[cardb/backup] modified stacks:',
    modified.map((s: { name: string }) => s.name),
  )
  console.log('[cardb/backup] lastBackupTime:', backupMs ? new Date(backupMs).toISOString() : 0)
  console.log('[cardb/backup] needsBackup:', modified.length > 0)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).__cardbMarkDirty = async (nameHint?: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (window as any).__cardbDb
  if (!db) {
    console.warn('[cardb] DB not ready yet')
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { rows } = (await db.query(
    nameHint
      ? 'SELECT id, name FROM stacks WHERE name ILIKE $1 LIMIT 1'
      : 'SELECT id, name FROM stacks LIMIT 1',
    nameHint ? [`%${nameHint}%`] : [],
  )) as { rows: { id: string; name: string }[] }
  const stack = rows[0]
  if (!stack) {
    console.warn('[cardb] No matching stack found')
    return
  }
  const { markStackModified } = await import('./db/queries/stacks')
  await markStackModified(db, stack.id)
  console.log(`[cardb] Marked "${stack.name}" (${stack.id}) as modified`)
}

// Erase stale OPFS if needed, then mount React (top-level await is fine in ESM).
await applyPendingReset()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('No #root element found')

createRoot(rootEl).render(
  <StrictMode>
    <HashRouter>
      <DbProvider>
        <App />
      </DbProvider>
    </HashRouter>
  </StrictMode>,
)
