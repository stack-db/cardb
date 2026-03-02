// ---------------------------------------------------------------------------
// IDB helpers — store backup metadata (directory handle + last backup time)
// in a tiny IndexedDB database separate from PGlite
// ---------------------------------------------------------------------------

import type { Db } from './db/index'
import { listModifiedStacks, clearStackModified } from './db/queries/stacks'
import { exportStackToMemory } from './db/queries/export'
import { serializeStack } from './stack/serialize'

const IDB_NAME = 'cardb-meta'
const IDB_VERSION = 1
const STORE = 'backup'

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openMetaDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openMetaDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await openMetaDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ---------------------------------------------------------------------------
// Directory handle persistence
// ---------------------------------------------------------------------------

export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return (await idbGet<FileSystemDirectoryHandle>('directoryHandle')) ?? null
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await idbSet('directoryHandle', handle)
}

/** Removes the saved folder and resets the backup timestamp. */
export async function clearSavedDirectoryHandle(): Promise<void> {
  await idbDelete('directoryHandle')
  await idbDelete('lastBackupTime')
}

// ---------------------------------------------------------------------------
// Last backup time (ms epoch, 0 = never)
// ---------------------------------------------------------------------------

export async function getLastBackupTime(): Promise<number> {
  return (await idbGet<number>('lastBackupTime')) ?? 0
}

export async function setLastBackupTime(ms: number): Promise<void> {
  await idbSet('lastBackupTime', ms)
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

/** Returns true if we already have write permission — does NOT prompt. */
export async function canAutoBackup(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

/** Prompts for write permission if needed. Returns true if granted. */
export async function requestBackupPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const existing = await handle.queryPermission({ mode: 'readwrite' })
    if (existing === 'granted') return true
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Prompt the user to choose a backup folder
// ---------------------------------------------------------------------------

export async function pickDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('Your browser does not support folder selection (try Chrome or Edge).')
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await saveDirectoryHandle(handle)
  return handle
}

// ---------------------------------------------------------------------------
// Back up all modified stacks to the chosen folder.
// Each stack is written as <stackId>.stack (overwrites previous backup for
// that stack). After a successful write the stack's is_modified flag is
// cleared so it won't be re-exported on the next cycle.
// ---------------------------------------------------------------------------

async function uniqueFileName(handle: FileSystemDirectoryHandle, base: string): Promise<string> {
  try {
    await handle.getFileHandle(`${base}.stack`, { create: false })
  } catch {
    return `${base}.stack` // file doesn't exist — name is free
  }
  for (let n = 2; ; n++) {
    const name = `${base}-${n}.stack`
    try {
      await handle.getFileHandle(name, { create: false })
    } catch {
      return name
    }
  }
}

export async function backupModifiedStacks(
  db: Db,
  handle: FileSystemDirectoryHandle,
): Promise<Date> {
  const stacks = await listModifiedStacks(db)
  for (const stack of stacks) {
    const loaded = await exportStackToMemory(db, stack.id)
    const blob = await serializeStack(loaded)
    const fileName = await uniqueFileName(handle, stack.name)
    const fileHandle = await handle.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    await clearStackModified(db, stack.id)
  }
  const now = new Date()
  await setLastBackupTime(now.getTime())
  return now
}
