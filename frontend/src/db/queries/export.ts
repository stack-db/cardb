/**
 * Reconstruct a LoadedStack from DB records (inverse of importStack).
 */

import type { Db } from '../index'
import type { LoadedStack } from '../../stack/load'
import { getStack } from './stacks'
import { listNodes } from './nodes'
import { listLinks } from './links'

export async function exportStackToMemory(db: Db, stackId: string): Promise<LoadedStack> {
  const [stackRecord, nodes, links] = await Promise.all([
    getStack(db, stackId),
    listNodes(db, stackId),
    listLinks(db, stackId),
  ])

  if (!stackRecord) {
    throw new Error(`Stack not found: ${stackId}`)
  }

  const nodeByDbId = new Map(nodes.map((n) => [n.id, n]))

  const resolvedNodes = nodes.map((n) => ({
    handle: n.handle,
    aliases: n.aliases,
    fields: n.fields,
    tags: n.tags,
  }))

  const nodeByHandle = new Map(resolvedNodes.map((n) => [n.handle, n]))

  const resolvedLinks = links
    .map((link) => {
      const sourceNode = nodeByDbId.get(link.sourceId)
      const targetNode = nodeByDbId.get(link.targetId)
      if (!sourceNode || !targetNode) return null
      return {
        handle: link.handle,
        aliases: link.aliases,
        source: nodeByHandle.get(sourceNode.handle)!,
        target: nodeByHandle.get(targetNode.handle)!,
        rel: link.rel,
        fields: link.fields,
        tags: link.tags,
      }
    })
    .filter((l) => l !== null) as LoadedStack['links']

  // Fetch embedded files
  const { rows } = await db.query<{
    path: string
    data: Uint8Array
  }>('SELECT path, data FROM embedded_files WHERE stack_id = $1', [stackId])

  const embeddedFiles = new Map<string, Uint8Array>(rows.map((r) => [r.path, r.data]))

  return {
    title: stackRecord.name,
    firstCardHandle: stackRecord.firstCardHandle,
    nodes: resolvedNodes,
    links: resolvedLinks,
    embeddedFiles,
    stackFields: stackRecord.stackFields,
  }
}
