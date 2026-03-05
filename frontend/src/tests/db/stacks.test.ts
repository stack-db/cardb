import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDb, type Db } from '../../db/index'
import { importStack, listStacks, getStack, deleteStack } from '../../db/queries/stacks'
import { listNodes } from '../../db/queries/nodes'
import { listLinks } from '../../db/queries/links'
import { getSelectedStackId, setSelectedStack } from '../../db/queries/appState'
import type { LoadedStack } from '../../stack/load'

let db: Db

const minimal: LoadedStack = {
  title: 'Test Stack',
  firstCardHandle: 'alice',
  nodes: [
    { handle: 'alice', aliases: ['al'], fields: { name: 'Alice' }, tags: ['person'] },
    { handle: 'bob', aliases: [], fields: { name: 'Bob' }, tags: ['person', 'friend'] },
  ],
  links: [
    {
      handle: null,
      aliases: [],
      source: { handle: 'alice', aliases: ['al'], fields: { name: 'Alice' }, tags: ['person'] },
      target: { handle: 'bob', aliases: [], fields: { name: 'Bob' }, tags: ['person', 'friend'] },
      rel: 'knows',
      fields: {},
      tags: [],
    },
  ],
  embeddedFiles: new Map(),
  stackFields: {},
}

beforeEach(async () => {
  db = await openTestDb()
})

afterEach(async () => {
  await db.close()
})

describe('importStack', () => {
  it('imports a stack and returns a StackRecord', async () => {
    const record = await importStack(db, minimal)
    expect(record.id).toBeTruthy()
    expect(record.name).toBe('Test Stack')
    expect(record.sourceUrl).toBeNull()
    expect(record.firstCardHandle).toBe('alice')
  })

  it('creates nodes with correct data', async () => {
    const record = await importStack(db, minimal)
    const nodes = await listNodes(db, record.id)
    expect(nodes).toHaveLength(2)

    const alice = nodes.find((n) => n.handle === 'alice')
    expect(alice).toBeDefined()
    expect(alice!.aliases).toEqual(['al'])
    expect(alice!.fields).toEqual({ name: 'Alice' })
    expect(alice!.tags).toContain('person')
    expect(alice!.position).toBe(0)

    const bob = nodes.find((n) => n.handle === 'bob')
    expect(bob).toBeDefined()
    expect(bob!.tags).toContain('friend')
    expect(bob!.position).toBe(1)
  })

  it('creates links with correct rel', async () => {
    const record = await importStack(db, minimal)
    const links = await listLinks(db, record.id)
    expect(links).toHaveLength(1)
    expect(links[0].rel).toBe('knows')
  })

  it('replaces an existing stack with the same name', async () => {
    await importStack(db, minimal)
    await importStack(db, minimal)

    const all = await listStacks(db)
    expect(all).toHaveLength(1) // replaced, not duplicated
  })
})

describe('listStacks / getStack / deleteStack', () => {
  it('lists imported stacks', async () => {
    await importStack(db, minimal)
    const stacks = await listStacks(db)
    expect(stacks).toHaveLength(1)
    expect(stacks[0].name).toBe('Test Stack')
  })

  it('gets a single stack by id', async () => {
    const record = await importStack(db, minimal)
    const found = await getStack(db, record.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe('Test Stack')
  })

  it('returns null for unknown id', async () => {
    const found = await getStack(db, 'nonexistent-uuid')
    expect(found).toBeNull()
  })

  it('deletes a stack and cascades to nodes/links', async () => {
    const record = await importStack(db, minimal)
    await deleteStack(db, record.id)

    const stacks = await listStacks(db)
    expect(stacks).toHaveLength(0)

    const nodes = await listNodes(db, record.id)
    expect(nodes).toHaveLength(0)

    const links = await listLinks(db, record.id)
    expect(links).toHaveLength(0)
  })
})

describe('selected stack', () => {
  it('returns null when no stack selected', async () => {
    const id = await getSelectedStackId(db)
    expect(id).toBeNull()
  })

  it('sets and retrieves the selected stack id', async () => {
    const record = await importStack(db, minimal)
    await setSelectedStack(db, record.id)
    const id = await getSelectedStackId(db)
    expect(id).toBe(record.id)
  })
})
