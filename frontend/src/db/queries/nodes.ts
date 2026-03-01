import type { Db } from '../index'

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export interface NodeRecord {
  id: string
  stackId: string
  handle: string
  aliases: string[]
  fields: Record<string, unknown>
  tags: string[]
  position: number
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Row → record mapper
// ---------------------------------------------------------------------------

interface NodeRow {
  id: string
  stack_id: string
  handle: string
  aliases: string[]
  fields: Record<string, unknown>
  position: number
  created_at: string
  updated_at: string
}

function mapNodeRow(row: NodeRow, tags: string[]): NodeRecord {
  return {
    id: row.id,
    stackId: row.stack_id,
    handle: row.handle,
    aliases: row.aliases ?? [],
    fields: row.fields ?? {},
    tags,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listNodes(db: Db, stackId: string): Promise<NodeRecord[]> {
  const { rows } = await db.query<NodeRow>(
    `SELECT id, stack_id, handle, aliases, fields, position, created_at, updated_at
     FROM nodes WHERE stack_id = $1 ORDER BY position`,
    [stackId],
  )

  if (rows.length === 0) return []

  // Fetch all tags for these nodes in one query
  const nodeIds = rows.map((r) => r.id)
  const tagResult = await db.query<{ node_id: string; tag: string }>(
    `SELECT node_id, tag FROM node_tags WHERE node_id = ANY($1)`,
    [nodeIds],
  )

  const tagsByNodeId = new Map<string, string[]>()
  for (const t of tagResult.rows) {
    const list = tagsByNodeId.get(t.node_id) ?? []
    list.push(t.tag)
    tagsByNodeId.set(t.node_id, list)
  }

  return rows.map((row) => mapNodeRow(row, tagsByNodeId.get(row.id) ?? []))
}

export async function getNode(db: Db, nodeId: string): Promise<NodeRecord | null> {
  const { rows } = await db.query<NodeRow>(
    `SELECT id, stack_id, handle, aliases, fields, position, created_at, updated_at
     FROM nodes WHERE id = $1`,
    [nodeId],
  )
  if (!rows[0]) return null

  const { rows: tagRows } = await db.query<{ tag: string }>(
    'SELECT tag FROM node_tags WHERE node_id = $1',
    [nodeId],
  )
  return mapNodeRow(rows[0], tagRows.map((t) => t.tag))
}

export async function getNodeByHandle(
  db: Db,
  stackId: string,
  handle: string,
): Promise<NodeRecord | null> {
  const { rows } = await db.query<NodeRow>(
    `SELECT id, stack_id, handle, aliases, fields, position, created_at, updated_at
     FROM nodes WHERE stack_id = $1 AND handle = $2`,
    [stackId, handle],
  )
  if (!rows[0]) return null

  const { rows: tagRows } = await db.query<{ tag: string }>(
    'SELECT tag FROM node_tags WHERE node_id = $1',
    [rows[0].id],
  )
  return mapNodeRow(rows[0], tagRows.map((t) => t.tag))
}

export async function searchNodes(
  db: Db,
  stackId: string,
  query: string,
): Promise<NodeRecord[]> {
  const pattern = `%${query}%`
  const { rows } = await db.query<NodeRow>(
    `SELECT id, stack_id, handle, aliases, fields, position, created_at, updated_at
     FROM nodes WHERE stack_id = $1 AND (
       handle ILIKE $2
       OR fields::text ILIKE $2
     ) ORDER BY position LIMIT 50`,
    [stackId, pattern],
  )

  if (rows.length === 0) return []

  const nodeIds = rows.map((r) => r.id)
  const tagResult = await db.query<{ node_id: string; tag: string }>(
    'SELECT node_id, tag FROM node_tags WHERE node_id = ANY($1)',
    [nodeIds],
  )
  const tagsByNodeId = new Map<string, string[]>()
  for (const t of tagResult.rows) {
    const list = tagsByNodeId.get(t.node_id) ?? []
    list.push(t.tag)
    tagsByNodeId.set(t.node_id, list)
  }

  return rows.map((row) => mapNodeRow(row, tagsByNodeId.get(row.id) ?? []))
}
