import type { NodeData } from './types'
import type { StackDef } from './stacks'

export function getNodeLabel(node: NodeData): string {
  const v = node.fields['title'] ?? node.fields['name']
  return typeof v === 'string' && v ? v : node.handle
}

export function sourceLabel(s: StackDef): string | null {
  if (s.source.type === 'remote') return 'remote'
  if (s.source.type === 'local') return 'local'
  return null
}
