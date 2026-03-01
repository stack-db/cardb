import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDb, type Db } from '../../db/index'

let db: Db

beforeEach(async () => {
  db = await openTestDb()
})

afterEach(async () => {
  await db.close()
})

describe('DB migrations', () => {
  it('creates all expected tables', async () => {
    const { rows } = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    )
    const tables = rows.map((r) => r.tablename)
    expect(tables).toContain('stacks')
    expect(tables).toContain('nodes')
    expect(tables).toContain('links')
    expect(tables).toContain('node_tags')
    expect(tables).toContain('link_tags')
    expect(tables).toContain('embedded_files')
    expect(tables).toContain('app_state')
    expect(tables).toContain('stack_extensions')
    expect(tables).toContain('schema_migrations')
  })

  it('seeds the selected_stack_id row in app_state', async () => {
    const { rows } = await db.query<{ key: string; value: string }>(
      "SELECT key, value FROM app_state WHERE key = 'selected_stack_id'",
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe('')
  })

  it('is idempotent — applying migrations twice does not error', async () => {
    const { applyMigrations } = await import('../../db/index')
    await expect(applyMigrations(db)).resolves.toBeUndefined()
  })
})
