import type { ResolvedGraph } from '../types'
import { LoadError, ParseError, StackError } from './errors'
import { loadStack, loadFromYamlString, loadedStackToResolvedGraph } from './load'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a YAML string into a ResolvedGraph.
 * Used directly in tests (no network dependency).
 *
 * Silently skips unresolvable link references (viewer, not validator).
 *
 * @throws {ParseError} if the YAML is invalid or graph constraints are violated
 */
export function parseGraph(yamlText: string): ResolvedGraph {
  try {
    const loaded = loadFromYamlString(yamlText)
    return loadedStackToResolvedGraph(loaded)
  } catch (err) {
    // Map StackError subclasses to ParseError for backward compatibility
    if (err instanceof StackError) {
      throw new ParseError(err.message)
    }
    throw err
  }
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
