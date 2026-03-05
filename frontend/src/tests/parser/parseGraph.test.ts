import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { parseGraph } from '../../stack/parser'
import { ParseError } from '../../stack/errors'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8')

describe('parseGraph', () => {
  it('parses minimal.yml: 2 nodes in index, 1 outgoing link, defaultHandle = alice', () => {
    const graph = parseGraph(fixture('minimal.yml'))

    expect(graph.nodeIndex.size).toBe(2)
    expect(graph.nodeIndex.has('alice')).toBe(true)
    expect(graph.nodeIndex.has('bob')).toBe(true)
    expect(graph.defaultHandle).toBe('alice')

    const aliceLinks = graph.outgoingLinks.get('alice')
    expect(aliceLinks).toHaveLength(1)
    expect(aliceLinks![0]).toEqual({ rel: 'knows', targetHandle: 'bob' })
  })

  it('orderedHandles contains canonical handles in file order (no aliases)', () => {
    const graph = parseGraph(fixture('minimal.yml'))
    expect(graph.orderedHandles).toEqual(['alice', 'bob'])
  })

  it('orderedHandles does not include aliases', () => {
    const yaml = `
nodes:
  - handle: jon-snow
    aliases: [lord-commander, aegon-targaryen]
    fields: {}
  - handle: sansa-stark
    fields: {}
`
    const graph = parseGraph(yaml)
    expect(graph.orderedHandles).toEqual(['jon-snow', 'sansa-stark'])
    expect(graph.orderedHandles).not.toContain('lord-commander')
  })

  it('parses minimal.yml: alice node has correct fields and tags', () => {
    const graph = parseGraph(fixture('minimal.yml'))
    const alice = graph.nodeIndex.get('alice')!
    expect(alice.handle).toBe('alice')
    expect(alice.fields['name']).toBe('Alice')
    expect(alice.tags).toContain('person')
  })

  it('handles empty.yml (no nodes) as an empty graph', () => {
    const graph = parseGraph(fixture('empty.yml'))
    expect(graph.nodeIndex.size).toBe(0)
    expect(graph.orderedHandles).toHaveLength(0)
    expect(graph.defaultHandle).toBe('')
  })

  it('throws ParseError for bad-yaml.yml (invalid YAML)', () => {
    expect(() => parseGraph(fixture('bad-yaml.yml'))).toThrow(ParseError)
  })

  it('falls back to first node when first_card handle is unknown', () => {
    const graph = parseGraph(fixture('unknown-first-card.yml'))
    expect(graph.defaultHandle).toBe('alice')
    expect(graph.nodeIndex.size).toBe(2)
  })

  it('uses first node in file order when first_card is absent', () => {
    const graph = parseGraph(fixture('no-first-card.yml'))
    expect(graph.defaultHandle).toBe('first-node')
  })

  it('throws ParseError on duplicate handle', () => {
    const yaml = `
nodes:
  - handle: dup
    fields: {}
  - handle: dup
    fields: {}
`
    expect(() => parseGraph(yaml)).toThrow(ParseError)
    expect(() => parseGraph(yaml)).toThrow(/duplicate/i)
  })

  it('silently skips links whose target handle is not in the index', () => {
    const yaml = `
nodes:
  - handle: alice
    fields: {}
links:
  - source: '@alice'
    target: '@ghost'
    rel: knows
`
    const graph = parseGraph(yaml)
    expect(graph.outgoingLinks.get('alice')).toHaveLength(0)
  })

  it('registers aliases in the node index', () => {
    const yaml = `
nodes:
  - handle: jon-snow
    aliases: [lord-commander, aegon-targaryen]
    fields:
      name: Jon Snow
`
    const graph = parseGraph(yaml)
    expect(graph.nodeIndex.has('jon-snow')).toBe(true)
    expect(graph.nodeIndex.has('lord-commander')).toBe(true)
    expect(graph.nodeIndex.has('aegon-targaryen')).toBe(true)
    // All three map to the same NodeData object
    expect(graph.nodeIndex.get('lord-commander')).toBe(graph.nodeIndex.get('jon-snow'))
  })

  it('throws ParseError when an alias collides with another handle', () => {
    const yaml = `
nodes:
  - handle: alice
    fields: {}
  - handle: bob
    aliases: [alice]
    fields: {}
`
    expect(() => parseGraph(yaml)).toThrow(ParseError)
    expect(() => parseGraph(yaml)).toThrow(/duplicate/i)
  })
})
