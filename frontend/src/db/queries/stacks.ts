import type { Db } from '../index'
import type { LoadedStack } from '../../stack/load'

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export interface StackRecord {
  id: string
  name: string
  sourceUrl: string | null
  firstCardHandle: string | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Row → record mappers
// ---------------------------------------------------------------------------

interface StackRow {
  id: string
  name: string
  source_url: string | null
  first_card_handle: string | null
  created_at: string
  updated_at: string
}

function mapStackRow(row: StackRow): StackRecord {
  return {
    id: row.id,
    name: row.name,
    sourceUrl: row.source_url,
    firstCardHandle: row.first_card_handle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Stack CRUD
// ---------------------------------------------------------------------------

export async function listStacks(db: Db): Promise<StackRecord[]> {
  const { rows } = await db.query<StackRow>(
    'SELECT id, name, source_url, first_card_handle, created_at, updated_at FROM stacks ORDER BY created_at',
  )
  return rows.map(mapStackRow)
}

export async function getStack(db: Db, stackId: string): Promise<StackRecord | null> {
  const { rows } = await db.query<StackRow>(
    'SELECT id, name, source_url, first_card_handle, created_at, updated_at FROM stacks WHERE id = $1',
    [stackId],
  )
  return rows[0] ? mapStackRow(rows[0]) : null
}

export async function getStackByName(db: Db, name: string): Promise<StackRecord | null> {
  const { rows } = await db.query<StackRow>(
    'SELECT id, name, source_url, first_card_handle, created_at, updated_at FROM stacks WHERE name = $1',
    [name],
  )
  return rows[0] ? mapStackRow(rows[0]) : null
}

export async function deleteStack(db: Db, stackId: string): Promise<void> {
  await db.query('DELETE FROM stacks WHERE id = $1', [stackId])
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Build a multi-row INSERT statement. Returns the SQL and flat params array.
// e.g. buildMultiInsert('nodes', ['id','name'], [['1','a'],['2','b']])
// → INSERT INTO nodes (id, name) VALUES ($1, $2), ($3, $4)  params=[1,a,2,b]
function buildMultiInsert(
  table: string,
  columns: string[],
  rows: unknown[][],
): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  const valueClauses = rows.map((row) => {
    const placeholders = row.map((val) => {
      params.push(val)
      return `$${params.length}`
    })
    return `(${placeholders.join(', ')})`
  })
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valueClauses.join(', ')}`,
    params,
  }
}

// ---------------------------------------------------------------------------
// Import a LoadedStack into the DB
// Replaces any existing stack with the same name.
// onProgress is called with a value 0–1 as work completes.
// ---------------------------------------------------------------------------

export type ImportProgressCallback = (pct: number) => void

const NODE_CHUNK = 100 // rows per batch insert
const LINK_CHUNK = 100
const TAG_CHUNK = 500 // PGlite hits an internal limit around 26k params; 500×2=1000 is safe

export async function importStack(
  db: Db,
  stack: LoadedStack,
  sourceUrl?: string,
  onProgress?: ImportProgressCallback,
): Promise<StackRecord> {
  const report = (pct: number) => onProgress?.(Math.min(1, Math.max(0, pct)))

  const nNodes = stack.nodes.length

  // Delete existing stack with same name (replace semantics)
  const existing = await getStackByName(db, stack.title)
  if (existing) await deleteStack(db, existing.id)

  const stackId = generateId()

  // Pre-generate all node IDs so links can reference them without a second pass
  const nodeIds = stack.nodes.map(() => generateId())
  const nodeIdByHandle = new Map(stack.nodes.map((n, i) => [n.handle, nodeIds[i]]))

  // Pre-filter valid links (both endpoints must exist)
  const validLinks = stack.links.filter(
    (l) => nodeIdByHandle.has(l.source.handle) && nodeIdByHandle.has(l.target.handle),
  )
  const linkIds = validLinks.map(() => generateId())

  await db.transaction(async (tx) => {
    // --- Stack row ---
    await tx.query(
      `INSERT INTO stacks (id, name, source_url, first_card_handle) VALUES ($1, $2, $3, $4)`,
      [stackId, stack.title, sourceUrl ?? null, stack.firstCardHandle ?? null],
    )
    report(0.02)

    // --- Nodes (batched) + collect all node_tags ---
    const allNodeTagRows: unknown[][] = []
    for (let i = 0; i < nNodes; i += NODE_CHUNK) {
      const slice = stack.nodes.slice(i, i + NODE_CHUNK)
      const { sql, params } = buildMultiInsert(
        'nodes',
        ['id', 'stack_id', 'handle', 'aliases', 'fields', 'position'],
        slice.map((n, j) => [
          nodeIds[i + j],
          stackId,
          n.handle,
          n.aliases,
          JSON.stringify(n.fields),
          i + j,
        ]),
      )
      await tx.query(sql, params)
      for (let j = 0; j < slice.length; j++) {
        for (const tag of slice[j].tags) {
          allNodeTagRows.push([nodeIds[i + j], tag])
        }
      }
      report(0.02 + ((i + slice.length) / Math.max(1, nNodes)) * 0.43)
    }

    // Node tags — chunked to stay under PGlite's bind-parameter limit
    for (let i = 0; i < allNodeTagRows.length; i += TAG_CHUNK) {
      const { sql, params } = buildMultiInsert(
        'node_tags',
        ['node_id', 'tag'],
        allNodeTagRows.slice(i, i + TAG_CHUNK),
      )
      await tx.query(sql + ' ON CONFLICT DO NOTHING', params)
    }
    report(0.48)

    // --- Links (batched) + collect all link_tags ---
    const allLinkTagRows: unknown[][] = []
    for (let i = 0; i < validLinks.length; i += LINK_CHUNK) {
      const slice = validLinks.slice(i, i + LINK_CHUNK)
      const { sql, params } = buildMultiInsert(
        'links',
        [
          'id',
          'stack_id',
          'source_id',
          'target_id',
          'handle',
          'aliases',
          'rel',
          'fields',
          'position',
        ],
        slice.map((l, j) => [
          linkIds[i + j],
          stackId,
          nodeIdByHandle.get(l.source.handle)!,
          nodeIdByHandle.get(l.target.handle)!,
          l.handle ?? null,
          l.aliases,
          l.rel,
          JSON.stringify(l.fields),
          i + j,
        ]),
      )
      await tx.query(sql, params)
      for (let j = 0; j < slice.length; j++) {
        for (const tag of slice[j].tags) {
          allLinkTagRows.push([linkIds[i + j], tag])
        }
      }
      report(0.5 + ((i + slice.length) / Math.max(1, validLinks.length)) * 0.45)
    }

    // Link tags — chunked to stay under PGlite's bind-parameter limit
    for (let i = 0; i < allLinkTagRows.length; i += TAG_CHUNK) {
      const { sql, params } = buildMultiInsert(
        'link_tags',
        ['link_id', 'tag'],
        allLinkTagRows.slice(i, i + TAG_CHUNK),
      )
      await tx.query(sql + ' ON CONFLICT DO NOTHING', params)
    }
    report(0.97)

    // --- Embedded files ---
    for (const [path, data] of stack.embeddedFiles) {
      const fileId = generateId()
      await tx.query(
        `INSERT INTO embedded_files (id, stack_id, path, data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (stack_id, path) DO UPDATE SET data = $4`,
        [fileId, stackId, path, data],
      )
    }
    report(1.0)
  })

  const record = await getStack(db, stackId)
  return record!
}
