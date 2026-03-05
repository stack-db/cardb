/**
 * Serialize a LoadedStack to a .stack ZIP archive Blob.
 * Produces a valid .stack archive with stack.yml at root + pack/ embedded files.
 *
 * Spec ref: 007-stack-format
 */

import { zipSync, strToU8 } from 'fflate'
import { stringify as stringifyYaml } from 'yaml'
import { StackSerializationError } from './errors'
import { isFileRef, resolveFileRef } from './refs'
import type { LoadedStack } from './load'

/**
 * Serialize a LoadedStack to a ZIP archive Blob with MIME type "application/zip".
 *
 * @throws StackSerializationError if any $.path file is missing from embeddedFiles
 */
export async function serializeStack(stack: LoadedStack, title?: string): Promise<Blob> {
  const effectiveTitle = title ?? stack.title

  // Build stack.yml content
  const ymlObj = buildYml(stack, effectiveTitle)
  const yamlText = stringifyYaml(ymlObj)
  const yamlBytes = strToU8(yamlText)

  // Collect ZIP entries
  const entries: Record<string, Uint8Array> = {
    'stack.yml': yamlBytes,
  }

  // Verify and include all embedded files referenced by $.path fields
  const referencedPaths = new Set<string>()
  for (const node of stack.nodes) {
    for (const value of Object.values(node.fields)) {
      if (isFileRef(value)) {
        referencedPaths.add(resolveFileRef(value as string))
      }
    }
  }

  for (const path of referencedPaths) {
    const data = stack.embeddedFiles.get(path)
    if (!data) {
      throw new StackSerializationError(
        `Missing embedded file: "pack/${path}" is referenced in the stack but not available`,
      )
    }
    entries[`pack/${path}`] = data
  }

  // Include all embedded files even if not referenced (future-proof)
  for (const [path, data] of stack.embeddedFiles) {
    if (!entries[`pack/${path}`]) {
      entries[`pack/${path}`] = data
    }
  }

  // Zip synchronously
  const zipBytes = zipSync(entries)
  return new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' })
}

// ---------------------------------------------------------------------------
// Build stack.yml object from LoadedStack
// ---------------------------------------------------------------------------

function buildYml(stack: LoadedStack, title: string): Record<string, unknown> {
  const nodes = stack.nodes.map((node) => {
    const obj: Record<string, unknown> = { handle: node.handle }
    if (node.aliases.length > 0) obj['aliases'] = node.aliases
    if (Object.keys(node.fields).length > 0) obj['fields'] = node.fields
    if (node.tags.length > 0) obj['tags'] = node.tags
    return obj
  })

  const links = stack.links.map((link) => {
    const obj: Record<string, unknown> = {
      source: `@${link.source.handle}`,
      target: `@${link.target.handle}`,
    }
    if (link.handle) obj['handle'] = link.handle
    if (link.aliases.length > 0) obj['aliases'] = link.aliases
    if (link.rel !== 'related') obj['rel'] = link.rel
    if (Object.keys(link.fields).length > 0) obj['fields'] = link.fields
    if (link.tags.length > 0) obj['tags'] = link.tags
    return obj
  })

  const yml: Record<string, unknown> = { version: '0.1', title }

  if (stack.firstCardHandle) {
    yml['first_card'] = `@${stack.firstCardHandle}`
  }

  if (stack.stackFields && Object.keys(stack.stackFields).length > 0) {
    yml['fields'] = stack.stackFields
  }

  if (stack.stackCode) {
    yml['code'] = stack.stackCode
  }

  yml['nodes'] = nodes
  if (links.length > 0) {
    yml['links'] = links
  }

  return yml
}
