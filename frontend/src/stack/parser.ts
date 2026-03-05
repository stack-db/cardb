import { parse as parseYaml } from 'yaml'
import type { NodeData, LinkData, RawLink, ResolvedGraph, StackYml } from '../types'
import { LoadError, ParseError } from './errors'
import { loadStack, loadedStackToResolvedGraph, buildTagCards } from './load'

// ---------------------------------------------------------------------------
// Pass 1: Build handle index
// ---------------------------------------------------------------------------

function buildHandleIndex(rawNodes: StackYml['nodes']): {
  index: Map<string, NodeData>
  firstHandle: string
  orderedHandles: string[]
} {
  if (!rawNodes || rawNodes.length === 0) {
    throw new ParseError('Graph is empty — nodes list has no entries')
  }

  const index = new Map<string, NodeData>()
  const orderedHandles: string[] = []
  let firstHandle = ''

  for (const raw of rawNodes) {
    if (!raw.handle) {
      throw new ParseError('A node is missing a required handle property')
    }

    const node: NodeData = {
      handle: raw.handle,
      aliases: raw.aliases ?? [],
      fields: raw.fields ?? {},
      tags: raw.tags ?? [],
    }

    // Register handle
    if (index.has(raw.handle)) {
      throw new ParseError(`Duplicate handle "${raw.handle}" — each node handle must be unique`)
    }
    index.set(raw.handle, node)
    orderedHandles.push(raw.handle)

    // Register aliases
    for (const alias of node.aliases) {
      if (index.has(alias)) {
        throw new ParseError(
          `Duplicate name "${alias}" — collides with an existing handle or alias`,
        )
      }
      index.set(alias, node)
    }

    if (!firstHandle) {
      firstHandle = raw.handle
    }
  }

  return { index, firstHandle, orderedHandles }
}

// ---------------------------------------------------------------------------
// Pass 2: Resolve links
// ---------------------------------------------------------------------------

function resolveLinks(
  rawLinks: RawLink[] | undefined,
  index: Map<string, NodeData>,
): Map<string, LinkData[]> {
  const outgoing = new Map<string, LinkData[]>()

  // Initialise empty arrays for all nodes so lookups never return undefined
  for (const node of new Set(index.values())) {
    if (!outgoing.has(node.handle)) {
      outgoing.set(node.handle, [])
    }
  }

  if (!rawLinks) return outgoing

  for (const raw of rawLinks) {
    // Strip the leading '@' from source/target
    const sourceHandle = raw.source?.startsWith('@') ? raw.source.slice(1) : raw.source
    const targetHandle = raw.target?.startsWith('@') ? raw.target.slice(1) : raw.target

    const sourceNode = index.get(sourceHandle)
    const targetNode = index.get(targetHandle)

    if (!sourceNode || !targetNode) {
      // Silently skip unresolvable links (viewer, not validator)
      continue
    }

    const links = outgoing.get(sourceNode.handle)!
    links.push({
      rel: raw.rel ?? 'related',
      targetHandle: targetNode.handle,
    })

    if (raw.bidirectional) {
      const reverseLinks = outgoing.get(targetNode.handle)!
      reverseLinks.push({
        rel: raw['reverse-rel'] ?? raw.rel ?? 'related',
        targetHandle: sourceNode.handle,
      })
    }
  }

  return outgoing
}

// ---------------------------------------------------------------------------
// Resolve default handle
// ---------------------------------------------------------------------------

function resolveDefaultHandle(
  yml: StackYml,
  index: Map<string, NodeData>,
  firstHandle: string,
): string {
  if (yml.first_card) {
    const candidate = yml.first_card.startsWith('@') ? yml.first_card.slice(1) : yml.first_card
    const node = index.get(candidate)
    if (node) return node.handle
    // Falls back to firstHandle silently
  }
  return firstHandle
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a YAML string into a ResolvedGraph.
 * Used directly in tests (no network dependency).
 *
 * @throws {ParseError} if the YAML is invalid or graph constraints are violated
 */
export function parseGraph(yamlText: string): ResolvedGraph {
  let yml: StackYml

  try {
    yml = parseYaml(yamlText) as StackYml
  } catch (err) {
    throw new ParseError(`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!yml || typeof yml !== 'object') {
    throw new ParseError('stack.yml must be a YAML mapping at the top level')
  }

  const { index, firstHandle, orderedHandles } = buildHandleIndex(yml.nodes)
  const outgoingLinks = resolveLinks(yml.links, index)
  const defaultHandle = resolveDefaultHandle(yml, index, firstHandle)

  const stackCode = typeof yml.code === 'string' ? yml.code : undefined
  const stackFields =
    typeof yml.fields === 'object' && yml.fields !== null && !Array.isArray(yml.fields)
      ? (yml.fields as Record<string, unknown>)
      : {}
  const nodeList = orderedHandles.map((h) => index.get(h)!)
  const tagCards = buildTagCards(nodeList)
  return { nodeIndex: index, outgoingLinks, defaultHandle, orderedHandles, stackCode, stackFields, tagCards }
}

/**
 * Loads a stack from any source and returns the fully resolved graph.
 *
 * - bundled: fetch from public/ using baseUrl + filename
 * - local:   parse content string directly (no network)
 * - remote:  fetch from an arbitrary URL
 *
 * @throws {LoadError} if a fetch fails (network error, non-200)
 * @throws {ParseError} if the YAML is invalid or graph constraints are violated
 */
export async function loadGraph(
  baseUrl: string,
  stack: import('../stacks').StackDef,
): Promise<ResolvedGraph> {
  if (stack.source.type === 'local') {
    return parseGraph(stack.source.content)
  }

  const url =
    stack.source.type === 'bundled' ? `${baseUrl}${stack.source.filename}` : stack.source.url

  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return loadedStackToResolvedGraph(await loadStack(bytes))
  } catch (err) {
    if (err instanceof ParseError) throw err
    throw new LoadError(err)
  }
}
