// ---------------------------------------------------------------------------
// Raw parsed types (directly from stack.yml YAML)
// ---------------------------------------------------------------------------

/** A node entry as parsed from stack.yml (before link resolution). */
export interface RawNode {
  handle: string
  aliases?: string[]
  fields: Record<string, unknown>
  tags?: string[]
}

/** A link entry as parsed from stack.yml (before handle resolution). */
export interface RawLink {
  source: string           // '@handle' bare string
  target: string           // '@handle' bare string
  rel?: string             // relationship type label; defaults to 'related'
  'reverse-rel'?: string   // rel label to use in the reverse direction (requires bidirectional)
  bidirectional?: boolean  // if true, also display the inverse link on the target node
  fields?: Record<string, unknown>
  tags?: string[]
}

/** Top-level structure of a stack.yml file. */
export interface StackYml {
  title?: string
  first_card?: string  // '@handle' bare string; optional
  nodes: RawNode[]
  links?: RawLink[]
}

// ---------------------------------------------------------------------------
// Resolved graph types (post-parse, used by React components)
// ---------------------------------------------------------------------------

/** A fully resolved node — the canonical in-app representation. */
export interface NodeData {
  handle: string
  aliases: string[]
  fields: Record<string, unknown>  // includes '$.path' strings (rendered as plain text)
  tags: string[]
}

/** A resolved outgoing link from a source node. */
export interface LinkData {
  rel: string          // relationship type (e.g. 'killedBy', 'appears-in')
  targetHandle: string // resolved handle of the target node
}

/**
 * The complete in-memory graph, ready for O(1) lookups.
 * Built once at startup (or after DB load); never mutated.
 */
export interface ResolvedGraph {
  /** Maps every handle (and alias) → NodeData. */
  nodeIndex: Map<string, NodeData>

  /** Maps source handle → all outgoing links from that node. */
  outgoingLinks: Map<string, LinkData[]>

  /**
   * Handle of the default node to display on first load.
   * Determined by: (1) first_card in stack.yml if present and valid,
   * otherwise (2) the first node in file order.
   */
  defaultHandle: string

  /**
   * Canonical node handles in file order (no aliases).
   * Used for serial First/Prev/Next/Last navigation.
   */
  orderedHandles: string[]
}

// ---------------------------------------------------------------------------
// DB record types (from the PGlite layer)
// ---------------------------------------------------------------------------

export type { StackRecord } from './db/queries/stacks'
export type { NodeRecord } from './db/queries/nodes'
export type { LinkRecord } from './db/queries/links'
