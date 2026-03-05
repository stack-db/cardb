import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { loadStack, loadFromYamlString } from '../../stack/load'
import {
  StackArchiveError,
  StackYamlError,
  StackHandleCollisionError,
  StackMissingFileError,
} from '../../stack/errors'

function makeStack(yamlText: string, extraFiles?: Record<string, Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'stack.yml': strToU8(yamlText),
    ...extraFiles,
  }
  return zipSync(entries)
}

describe('loadStack', () => {
  it('loads a minimal valid stack', async () => {
    const yaml = `
title: Minimal
nodes:
  - handle: alice
    fields: { name: Alice }
    tags: [person]
  - handle: bob
    fields: { name: Bob }
links:
  - source: '@alice'
    target: '@bob'
    rel: knows
`
    const bytes = makeStack(yaml)
    const stack = await loadStack(bytes)

    expect(stack.title).toBe('Minimal')
    expect(stack.nodes).toHaveLength(2)
    expect(stack.nodes[0].handle).toBe('alice')
    expect(stack.nodes[0].tags).toContain('person')
    expect(stack.links).toHaveLength(2)
    expect(stack.links[0].rel).toBe('knows')
    expect(stack.links[0].source.handle).toBe('alice')
    expect(stack.links[0].target.handle).toBe('bob')
    // reverse link auto-generated (bidirectional default)
    expect(stack.links[1].rel).toBe('knows')
    expect(stack.links[1].source.handle).toBe('bob')
    expect(stack.links[1].target.handle).toBe('alice')
  })

  it('throws StackArchiveError for corrupt ZIP (PK header but invalid body)', async () => {
    // Bytes starting with PK are treated as ZIP; a corrupt body should throw StackArchiveError
    const corruptZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])
    await expect(loadStack(corruptZip)).rejects.toBeInstanceOf(StackArchiveError)
  })

  it('throws StackYamlError for non-ZIP bytes that are not valid YAML', async () => {
    // Bytes not starting with PK are treated as YAML text; binary garbage → StackYamlError
    const garbage = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    await expect(loadStack(garbage)).rejects.toBeInstanceOf(StackYamlError)
  })

  it('throws StackArchiveError when stack.yml missing', async () => {
    const emptyZip = zipSync({ 'other.txt': strToU8('hello') })
    await expect(loadStack(emptyZip)).rejects.toThrow('stack.yml not found')
  })

  it('throws StackYamlError for invalid YAML', async () => {
    const bytes = makeStack('nodes: [')
    await expect(loadStack(bytes)).rejects.toBeInstanceOf(StackYamlError)
  })

  it('handles empty nodes list', async () => {
    const yaml = 'title: Empty\nnodes: []\n'
    const bytes = makeStack(yaml)
    const stack = await loadStack(bytes)
    expect(stack.nodes).toHaveLength(0)
    expect(stack.links).toHaveLength(0)
  })

  it('throws on duplicate handle', async () => {
    const yaml = `
nodes:
  - handle: dup
    fields: {}
  - handle: dup
    fields: {}
`
    const bytes = makeStack(yaml)
    await expect(loadStack(bytes)).rejects.toBeInstanceOf(StackHandleCollisionError)
  })

  it('resolves first_card handle', async () => {
    const yaml = `
first_card: '@bob'
nodes:
  - handle: alice
    fields: {}
  - handle: bob
    fields: {}
`
    const bytes = makeStack(yaml)
    const stack = await loadStack(bytes)
    expect(stack.firstCardHandle).toBe('bob')
  })

  it('collects embedded files from pack/', async () => {
    const png = new Uint8Array([137, 80, 78, 71]) // PNG magic bytes
    const yaml = `
nodes:
  - handle: alice
    fields:
      photo: '$.headshots/alice.png'
`
    const bytes = makeStack(yaml, { 'pack/headshots/alice.png': png })
    const stack = await loadStack(bytes)
    expect(stack.embeddedFiles.has('headshots/alice.png')).toBe(true)
  })

  it('preserves code field when it is a string', async () => {
    const yaml = `
nodes:
  - handle: n001
    fields:
      code: |
        function onShowCard(node, stack, element) {
          element.innerHTML = '<h1>Hello</h1>'
        }
`
    const bytes = makeStack(yaml)
    const stack = await loadStack(bytes)
    expect(typeof stack.nodes[0].fields['code']).toBe('string')
    expect(stack.nodes[0].fields['code'] as string).toContain('onShowCard')
  })

  it('resolves code: {src} to file content from pack/', async () => {
    const script = 'function onShowCard(node, stack, element) { element.innerHTML = "Hi" }'
    const yaml = `
nodes:
  - handle: n001
    fields:
      code:
        src: '$/script.js'
`
    const bytes = makeStack(yaml, { 'pack/script.js': strToU8(script) })
    const stack = await loadStack(bytes)
    expect(stack.nodes[0].fields['code']).toBe(script)
  })

  it('throws StackMissingFileError when code src file is absent', async () => {
    const yaml = `
nodes:
  - handle: n001
    fields:
      code:
        src: '$/missing.js'
`
    const bytes = makeStack(yaml)
    await expect(loadStack(bytes)).rejects.toBeInstanceOf(StackMissingFileError)
  })

  it('resolves aliases in link references', async () => {
    const yaml = `
nodes:
  - handle: alice
    aliases: [al]
    fields: {}
  - handle: bob
    fields: {}
links:
  - source: '@al'
    target: '@bob'
    rel: knows
`
    const bytes = makeStack(yaml)
    const stack = await loadStack(bytes)
    expect(stack.links[0].source.handle).toBe('alice')
  })
})

describe('loadFromYamlString', () => {
  it('parses plain YAML text (bundled stack path)', async () => {
    const yaml = `
title: Got
nodes:
  - handle: jon-snow
    fields: { name: Jon Snow }
    tags: [person]
`
    const stack = await loadFromYamlString(yaml, 'GraphOfThrones')
    expect(stack.title).toBe('GraphOfThrones')
    expect(stack.nodes).toHaveLength(1)
    expect(stack.nodes[0].handle).toBe('jon-snow')
    expect(stack.embeddedFiles.size).toBe(0)
  })
})
