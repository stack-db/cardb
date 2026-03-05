/**
 * Two-pass handle/alias resolver for stack.yml parsed YAML.
 *
 * Pass 1: Index all handles and aliases. Raise on collision.
 * Pass 2: Resolve all @name references in links. Raise on unresolved ref.
 */

import { StackHandleCollisionError, StackUnresolvedRefError, StackYamlError } from './errors'
import type { ResolvedNode, ResolvedLink } from './load'

// ---------------------------------------------------------------------------
// Raw YAML types (stack.yml parsed structure)
// ---------------------------------------------------------------------------

export interface RawYmlNode {
  handle: string
  aliases?: string[]
  fields?: Record<string, unknown>
  tags?: string[]
}

export interface RawYmlLink {
  handle?: string
  aliases?: string[]
  source: string // '@handle' bare string
  target: string // '@handle' bare string
  rel?: string
  fields?: Record<string, unknown>
  tags?: string[]
}

export interface RawYml {
  title?: string
  first_card?: string
  fields?: Record<string, unknown>
  nodes?: RawYmlNode[]
  links?: RawYmlLink[]
  code?: string | { src: string }
}

// ---------------------------------------------------------------------------
// Pass 1: Build handle index
// ---------------------------------------------------------------------------

export interface HandleIndex {
  /** Maps handle and alias names → ResolvedNode */
  nodeByName: Map<string, ResolvedNode>
  /** Canonical nodes in file order (no aliases) */
  orderedNodes: ResolvedNode[]
}

export function buildHandleIndex(rawNodes: RawYmlNode[]): HandleIndex {
  const nodeByName = new Map<string, ResolvedNode>()
  const orderedNodes: ResolvedNode[] = []

  for (const raw of rawNodes) {
    if (!raw.handle || typeof raw.handle !== 'string') {
      throw new StackYamlError('A node is missing a required "handle" property')
    }

    const node: ResolvedNode = {
      handle: raw.handle,
      aliases: raw.aliases ?? [],
      fields: raw.fields ?? {},
      tags: raw.tags ?? [],
    }

    if (nodeByName.has(raw.handle)) {
      throw new StackHandleCollisionError(
        raw.handle,
        `Duplicate handle "${raw.handle}" — each node handle must be unique`,
      )
    }
    nodeByName.set(raw.handle, node)
    orderedNodes.push(node)

    for (const alias of node.aliases) {
      if (nodeByName.has(alias)) {
        throw new StackHandleCollisionError(
          alias,
          `Duplicate name "${alias}" — collides with an existing handle or alias`,
        )
      }
      nodeByName.set(alias, node)
    }
  }

  return { nodeByName, orderedNodes }
}

// ---------------------------------------------------------------------------
// Pass 2: Resolve links
// ---------------------------------------------------------------------------

/** Strip leading '@' from a handle reference string. */
function stripAt(ref: string): string {
  return ref.startsWith('@') ? ref.slice(1) : ref
}

export function resolveLinks(
  rawLinks: RawYmlLink[] | undefined,
  index: HandleIndex,
): ResolvedLink[] {
  if (!rawLinks) return []

  const resolved: ResolvedLink[] = []

  for (const raw of rawLinks) {
    const sourceKey = stripAt(raw.source ?? '')
    const targetKey = stripAt(raw.target ?? '')

    const sourceNode = index.nodeByName.get(sourceKey)
    const targetNode = index.nodeByName.get(targetKey)

    if (!sourceNode) {
      throw new StackUnresolvedRefError(
        raw.source,
        `Unresolved reference: "${raw.source}" — no node with that handle or alias`,
      )
    }
    if (!targetNode) {
      throw new StackUnresolvedRefError(
        raw.target,
        `Unresolved reference: "${raw.target}" — no node with that handle or alias`,
      )
    }

    resolved.push({
      handle: raw.handle ?? null,
      aliases: raw.aliases ?? [],
      source: sourceNode,
      target: targetNode,
      rel: raw.rel ?? 'related',
      fields: raw.fields ?? {},
      tags: raw.tags ?? [],
    })
  }

  return resolved
}

// ---------------------------------------------------------------------------
// File reference helpers
// ---------------------------------------------------------------------------

/** Returns true if value is a stack file reference (starts with "$."). */
export function isFileRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('$.')
}

/** Given a file reference string (e.g. "$.headshots/bob.jpg"), returns the docs-relative path. */
export function resolveFileRef(ref: string): string {
  if (!isFileRef(ref)) {
    throw new TypeError(`Not a valid file reference: "${ref}"`)
  }
  return ref.slice(2) // strip "$."
}
