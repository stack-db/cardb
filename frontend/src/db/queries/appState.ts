import type { Db } from '../index'

export async function getSelectedStackId(db: Db): Promise<string | null> {
  const { rows } = await db.query<{ value: string }>(
    "SELECT value FROM app_state WHERE key = 'selected_stack_id'",
  )
  const val = rows[0]?.value ?? ''
  return val === '' ? null : val
}

export async function setSelectedStack(db: Db, stackId: string): Promise<void> {
  await db.query(
    "INSERT INTO app_state (key, value) VALUES ('selected_stack_id', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [stackId],
  )
}

export async function clearSelectedStack(db: Db): Promise<void> {
  await db.query(
    "INSERT INTO app_state (key, value) VALUES ('selected_stack_id', '') ON CONFLICT (key) DO UPDATE SET value = ''",
  )
}
