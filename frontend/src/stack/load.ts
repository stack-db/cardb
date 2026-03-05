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
  /** JavaScript code string from the top-level `code:` field in stack.yml. */
  stackCode?: string
  /** Fields defined at the stack level — inherited by all cards as defaults. */
  stackFields: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Load from a .stack ZIP archive
// ---------------------------------------------------------------------------

/**
 * Load a stack from raw bytes — either a .stack ZIP archive or plain YAML text.
 *
 * Detection: if the bytes start with the ZIP magic number (PK = 0x50 0x4B),
 * treat as a ZIP archive; otherwise decode as UTF-8 and treat as stack.yml
 * with an empty docs/ folder.
 *
 * @throws StackArchiveError on invalid ZIP or missing stack.yml
 * @throws StackYamlError on YAML parse failure or schema violation
 * @throws StackHandleCollisionError on handle/alias collision
 * @throws StackUnresolvedRefError on unresolved @name link ref
 * @throws StackMissingFileError on missing $.path file reference
 */
export async function loadStack(bytes: Uint8Array): Promise<LoadedStack> {
  // ZIP magic: first two bytes are 'P' (0x50) and 'K' (0x4B)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return loadStackFromZip(bytes)
  }
  // Plain YAML — treat as stack.yml with empty docs/
  return loadFromYaml(strFromU8(bytes), new Map())
}

function loadStackFromZip(archiveBytes: Uint8Array): LoadedStack {
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

  return loadFromYaml(strFromU8(files['stack.yml']), embeddedFiles)
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
// Resolve a code field value (string or {src: '$/...'}) to a string.
// ---------------------------------------------------------------------------

function resolveCode(
  code: unknown,
  embeddedFiles: Map<string, Uint8Array>,
  context: string,
): string | undefined {
  if (typeof code === 'string') return code
  if (code !== null && typeof code === 'object' && !Array.isArray(code)) {
    const src = (code as Record<string, unknown>)['src']
    if (typeof src === 'string' && src.startsWith('$/')) {
      const filePath = src.slice(2)
      const fileBytes = embeddedFiles.get(filePath)
      if (!fileBytes) {
        throw new StackMissingFileError(
          filePath,
          `Missing code source file: "docs/${filePath}" referenced in ${context}`,
        )
      }
      return strFromU8(fileBytes)
    }
  }
  return undefined
}

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

  // Pass 3: Resolve code fields ({src: '$/...'} or plain string) → string
  const stackCode = resolveCode(yml.code, embeddedFiles, 'top-level code')
  for (const node of index.orderedNodes) {
    const resolved = resolveCode(node.fields['code'], embeddedFiles, `node "${node.handle}"`)
    if (resolved !== undefined) node.fields = { ...node.fields, code: resolved }
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
  const stackFields =
    typeof yml.fields === 'object' && yml.fields !== null && !Array.isArray(yml.fields)
      ? (yml.fields as Record<string, unknown>)
      : {}

  return {
    title,
    firstCardHandle,
    nodes: index.orderedNodes,
    links,
    embeddedFiles,
    stackCode,
    stackFields,
  }
}

// ---------------------------------------------------------------------------
// Utility: build tag-card map from a list of nodes
// ---------------------------------------------------------------------------

/**
 * A tag card is a node whose handle equals a tag name used anywhere in the stack.
 * Returns a map of tag name → that card's fields (used as field defaults for
 * all cards carrying that tag).
 */
export function buildTagCards(
  nodes: { handle: string; fields: Record<string, unknown>; tags: string[] }[],
): Map<string, Record<string, unknown>> {
  const allTags = new Set<string>()
  for (const node of nodes) {
    for (const tag of node.tags) allTags.add(tag)
  }
  const tagCards = new Map<string, Record<string, unknown>>()
  for (const node of nodes) {
    if (allTags.has(node.handle)) {
      tagCards.set(node.handle, node.fields)
    }
  }
  return tagCards
}

// ---------------------------------------------------------------------------
// Bridge: LoadedStack → ResolvedGraph
// Used when a .stack archive has been loaded and the caller needs a ResolvedGraph.
// ---------------------------------------------------------------------------

export function loadedStackToResolvedGraph(loaded: LoadedStack): ResolvedGraph {
  const nodeIndex = new Map<string, NodeData>()
  const orderedHandles: string[] = []

  for (const node of loaded.nodes) {
    const data: NodeData = {
      handle: node.handle,
      aliases: node.aliases,
      fields: node.fields,
      tags: node.tags,
    }
    nodeIndex.set(node.handle, data)
    for (const alias of node.aliases) {
      nodeIndex.set(alias, data)
    }
    orderedHandles.push(node.handle)
  }

  const outgoingLinks = new Map<string, LinkData[]>()
  for (const handle of orderedHandles) {
    outgoingLinks.set(handle, [])
  }
  for (const link of loaded.links) {
    const list = outgoingLinks.get(link.source.handle) ?? []
    list.push({ rel: link.rel, targetHandle: link.target.handle })
    outgoingLinks.set(link.source.handle, list)
  }

  return {
    nodeIndex,
    outgoingLinks,
    defaultHandle: loaded.firstCardHandle ?? orderedHandles[0] ?? '',
    orderedHandles,
    stackCode: loaded.stackCode,
    stackFields: loaded.stackFields,
    tagCards: buildTagCards(loaded.nodes),
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
    stackCode: graph.stackCode,
    stackFields: graph.stackFields ?? {},
  }
}
