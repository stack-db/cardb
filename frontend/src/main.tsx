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

function resetDb() {
  sessionStorage.setItem('cardb_reset', '1')
  console.log('[cardb] Reset scheduled. Reloading…')
  location.reload()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).__cardbResetDb = resetDb

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
