export type StackSource =
  | { type: 'bundled'; filename: string }
  | { type: 'local'; content: string }
  | { type: 'remote'; url: string }

export interface StackDef {
  id: string
  label: string
  source: StackSource
}

export const BUILTIN_STACKS: StackDef[] = [
  {
    id: 'about',
    label: 'About stackdb',
    source: { type: 'bundled', filename: 'about.yml' },
  },
  { id: 'got', label: 'GraphOfThrones', source: { type: 'bundled', filename: 'got.yml' } },
  { id: 'medline', label: 'MedlinePlus', source: { type: 'bundled', filename: 'medline.yml' } },
]

const REMOTE_STACKS_KEY = 'cardb_remote_stacks'

export function loadRemoteStacks(): StackDef[] {
  try {
    const raw = localStorage.getItem(REMOTE_STACKS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StackDef[]
  } catch {
    return []
  }
}

export function saveRemoteStacks(stacks: StackDef[]): void {
  const remote = stacks.filter((s) => s.source.type === 'remote')
  localStorage.setItem(REMOTE_STACKS_KEY, JSON.stringify(remote))
}

// ---------------------------------------------------------------------------
// Load state — tracked in React state, not in DB
// ---------------------------------------------------------------------------

/** UI-only state for each stack in the selector. */
export type StackLoadState = 'unloaded' | 'loading' | 'loaded' | 'error'
