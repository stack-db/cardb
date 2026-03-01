import type { Db } from '../index'

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export interface LinkRecord {
  id: string
  stackId: string
  sourceId: string
  targetId: string
  handle: string | null
  aliases: string[]
  rel: string
  fields: Record<string, unknown>
  tags: string[]
  position: number
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Row → record mapper
// ---------------------------------------------------------------------------

interface LinkRow {
  id: string
  stack_id: string
  source_id: string
  target_id: string
  handle: string | null
  aliases: string[]
  rel: string
  fields: Record<string, unknown>
  position: number
  created_at: string
  updated_at: string
}

function mapLinkRow(row: LinkRow, tags: string[]): LinkRecord {
  return {
    id: row.id,
    stackId: row.stack_id,
    sourceId: row.source_id,
    targetId: row.target_id,
    handle: row.handle,
    aliases: row.aliases ?? [],
    rel: row.rel,
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

export async function listLinks(db: Db, stackId: string): Promise<LinkRecord[]> {
  const { rows } = await db.query<LinkRow>(
    `SELECT id, stack_id, source_id, target_id, handle, aliases, rel, fields, position, created_at, updated_at
     FROM links WHERE stack_id = $1 ORDER BY position`,
    [stackId],
  )

  if (rows.length === 0) return []

  const linkIds = rows.map((r) => r.id)
  const tagResult = await db.query<{ link_id: string; tag: string }>(
    'SELECT link_id, tag FROM link_tags WHERE link_id = ANY($1)',
    [linkIds],
  )

  const tagsByLinkId = new Map<string, string[]>()
  for (const t of tagResult.rows) {
    const list = tagsByLinkId.get(t.link_id) ?? []
    list.push(t.tag)
    tagsByLinkId.set(t.link_id, list)
  }

  return rows.map((row) => mapLinkRow(row, tagsByLinkId.get(row.id) ?? []))
}

export async function listLinksForNode(
  db: Db,
  nodeId: string,
): Promise<LinkRecord[]> {
  const { rows } = await db.query<LinkRow>(
    `SELECT id, stack_id, source_id, target_id, handle, aliases, rel, fields, position, created_at, updated_at
     FROM links WHERE source_id = $1 ORDER BY position`,
    [nodeId],
  )

  if (rows.length === 0) return []

  const linkIds = rows.map((r) => r.id)
  const tagResult = await db.query<{ link_id: string; tag: string }>(
    'SELECT link_id, tag FROM link_tags WHERE link_id = ANY($1)',
    [linkIds],
  )

  const tagsByLinkId = new Map<string, string[]>()
  for (const t of tagResult.rows) {
    const list = tagsByLinkId.get(t.link_id) ?? []
    list.push(t.tag)
    tagsByLinkId.set(t.link_id, list)
  }

  return rows.map((row) => mapLinkRow(row, tagsByLinkId.get(row.id) ?? []))
}
