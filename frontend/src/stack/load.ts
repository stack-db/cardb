/**
 * Stack loading: .stack ZIP archives → LoadedStack
 * Also provides resolvedGraphToLoadedStack() for bridging the legacy YAML parser.
 *
 * Spec refs: 007-stack-format, 008-browser-pglite
 */

import { unzipSync, strFromU8 } from 'fflate'
import { parse as parseYaml } from 'yaml'
import { StackArchiveError, StackYamlError, StackMissingFileError } from './errors'
import { buildHandleIndex, resolveLinks, isFileRef, resolveFileRef, type RawYml } from './refs'
import type { ResolvedGraph, NodeData, LinkData } from '../types'

// ---------------------------------------------------------------------------
// Domain types (re-exported for consumers)
// ---------------------------------------------------------------------------

/** A node after Pass 2 resolution. */
export interface ResolvedNode {
  handle: string
  aliases: string[]
  fields: Record<string, unknown>
  tags: string[]
}

/** A link after Pass 2 resolution — source and target are full node objects. */
export interface ResolvedLink {
  handle: string | null
  aliases: string[]
  source: ResolvedNode
  target: ResolvedNode
  rel: string
  fields: Record<string, unknown>
  tags: string[]
}

/** A fully resolved graph loaded from a .stack archive or YAML string. */
export interface LoadedStack {
  title: string
  /** Optional handle to use as the first displayed card. */
  firstCardHandle: string | null
  nodes: ResolvedNode[]
  links: ResolvedLink[]
  /** Map of docs-relative path → raw bytes (e.g. "headshots/bob.jpg" → Uint8Array). */
  embeddedFiles: Map<string, Uint8Array>
}

// ---------------------------------------------------------------------------
// Load from a .stack ZIP archive
// ---------------------------------------------------------------------------

/**
 * Load a .stack archive from raw bytes.
 *
 * Steps:
 *   1. Unzip the archive; validate it contains stack.yml at root.
 *   2. Parse stack.yml (YAML 1.2).
 *   3. Pass 1: index all handles and aliases; raise on collision.
 *   4. Pass 2: resolve all @name references in links; raise on unresolved ref.
 *   5. Validate all $.path references against docs/ entries.
 *
 * @throws StackArchiveError on invalid ZIP or missing stack.yml
 * @throws StackYamlError on YAML parse failure or schema violation
 * @throws StackHandleCollisionError on handle/alias collision
 * @throws StackUnresolvedRefError on unresolved @name link ref
 * @throws StackMissingFileError on missing $.path file reference
 */
export async function loadStack(archiveBytes: Uint8Array): Promise<LoadedStack> {
  // Step 1: Unzip
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(archiveBytes)
  } catch (err) {
    throw new StackArchiveError(
      `File is not a valid ZIP archive: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!files['stack.yml']) {
    throw new StackArchiveError('stack.yml not found at archive root')
  }

  // Collect embedded files from docs/ folder
  const embeddedFiles = new Map<string, Uint8Array>()
  for (const [path, data] of Object.entries(files)) {
    if (path.startsWith('docs/') && !path.endsWith('/')) {
      embeddedFiles.set(path.slice('docs/'.length), data)
    }
  }

  // Step 2: Parse YAML
  const yamlText = strFromU8(files['stack.yml'])
  return loadFromYaml(yamlText, embeddedFiles)
}

/**
 * Load a graph from a YAML string (for bundled stacks — no ZIP wrapping).
 * Embedded files are empty since bundled stacks don't use $.path refs.
 */
export async function loadFromYamlString(yamlText: string, title: string): Promise<LoadedStack> {
  return loadFromYaml(yamlText, new Map(), title)
}

// ---------------------------------------------------------------------------
// Internal: parse YAML + run two-pass resolver
// ---------------------------------------------------------------------------

function loadFromYaml(
  yamlText: string,
  embeddedFiles: Map<string, Uint8Array>,
  titleOverride?: string,
): LoadedStack {
  // Parse YAML
  let yml: RawYml
  try {
    yml = parseYaml(yamlText) as RawYml
  } catch (err) {
    throw new StackYamlError(
      `stack.yml: YAML parse error — ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!yml || typeof yml !== 'object') {
    throw new StackYamlError('stack.yml must be a YAML mapping at the top level')
  }

  const rawNodes = yml.nodes ?? []
  if (!Array.isArray(rawNodes)) {
    throw new StackYamlError('stack.yml: "nodes" must be a list')
  }

  // Pass 1: build handle index
  const index = buildHandleIndex(rawNodes)

  // Pass 2: resolve links
  const links = resolveLinks(yml.links, index)

  // Validate $.path file references
  for (const node of index.orderedNodes) {
    for (const [, value] of Object.entries(node.fields)) {
      if (isFileRef(value)) {
        const path = resolveFileRef(value as string)
        if (!embeddedFiles.has(path)) {
          throw new StackMissingFileError(
            path,
            `Missing embedded file: "docs/${path}" referenced in node "${node.handle}"`,
          )
        }
      }
    }
  }

  // Determine first card handle
  let firstCardHandle: string | null = null
  if (yml.first_card) {
    const key = yml.first_card.startsWith('@') ? yml.first_card.slice(1) : yml.first_card
    const node = index.nodeByName.get(key)
    if (node) firstCardHandle = node.handle
  }
  if (!firstCardHandle && index.orderedNodes.length > 0) {
    firstCardHandle = index.orderedNodes[0].handle
  }

  const title = titleOverride ?? yml.title ?? 'Untitled Stack'

  return {
    title,
    firstCardHandle,
    nodes: index.orderedNodes,
    links,
    embeddedFiles,
  }
}

// ---------------------------------------------------------------------------
// Bridge: ResolvedGraph → LoadedStack
// Used when loading bundled YAML stacks via the legacy parser path.
// ---------------------------------------------------------------------------

export function resolvedGraphToLoadedStack(graph: ResolvedGraph, title: string): LoadedStack {
  // Build node list from orderedHandles (dedup by handle — no aliases in list)
  const nodeDataList: NodeData[] = graph.orderedHandles.map((h) => graph.nodeIndex.get(h)!)

  // Map NodeData → ResolvedNode (same structure)
  const resolvedNodes: ResolvedNode[] = nodeDataList.map((n) => ({
    handle: n.handle,
    aliases: n.aliases,
    fields: n.fields,
    tags: n.tags,
  }))

  const nodeByHandle = new Map<string, ResolvedNode>(resolvedNodes.map((n) => [n.handle, n]))

  // Map outgoing links to ResolvedLink[]
  const resolvedLinks: ResolvedLink[] = []
  for (const [sourceHandle, links] of graph.outgoingLinks) {
    const sourceNode = nodeByHandle.get(sourceHandle)
    if (!sourceNode) continue
    for (const link of links) {
      const linkData = link as LinkData
      const targetNode = nodeByHandle.get(linkData.targetHandle)
      if (!targetNode) continue
      resolvedLinks.push({
        handle: null,
        aliases: [],
        source: sourceNode,
        target: targetNode,
        rel: linkData.rel,
        fields: {},
        tags: [],
      })
    }
  }

  return {
    title,
    firstCardHandle: graph.defaultHandle || null,
    nodes: resolvedNodes,
    links: resolvedLinks,
    embeddedFiles: new Map(),
  }
}
