export interface Migration {
  version: number
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS stacks (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        source_url      TEXT,
        first_card_handle TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id          TEXT PRIMARY KEY,
        stack_id    TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
        handle      TEXT NOT NULL,
        aliases     TEXT[] NOT NULL DEFAULT '{}',
        fields      JSONB NOT NULL DEFAULT '{}',
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (stack_id, handle)
      );

      CREATE TABLE IF NOT EXISTS links (
        id          TEXT PRIMARY KEY,
        stack_id    TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
        source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        handle      TEXT,
        aliases     TEXT[] NOT NULL DEFAULT '{}',
        rel         TEXT NOT NULL DEFAULT 'related',
        fields      JSONB NOT NULL DEFAULT '{}',
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS node_tags (
        node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        tag         TEXT NOT NULL,
        PRIMARY KEY (node_id, tag)
      );

      CREATE TABLE IF NOT EXISTS link_tags (
        link_id     TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
        tag         TEXT NOT NULL,
        PRIMARY KEY (link_id, tag)
      );

      CREATE TABLE IF NOT EXISTS embedded_files (
        id          TEXT PRIMARY KEY,
        stack_id    TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
        path        TEXT NOT NULL,
        mime_type   TEXT,
        data        BYTEA NOT NULL,
        UNIQUE (stack_id, path)
      );

      CREATE TABLE IF NOT EXISTS app_state (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stack_extensions (
        base_stack_id      TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
        extension_stack_id TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
        position           INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (base_stack_id, extension_stack_id),
        CHECK (base_stack_id != extension_stack_id)
      );

      INSERT INTO app_state (key, value) VALUES ('selected_stack_id', '')
        ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE stacks ADD COLUMN file_checksum TEXT;
      ALTER TABLE stacks ADD COLUMN is_modified BOOLEAN NOT NULL DEFAULT FALSE;
    `,
  },
  {
    version: 3,
    sql: `
      INSERT INTO app_state (key, value) VALUES ('last_db_modified', '')
        ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    // Migration 2 was originally written with INTEGER before being corrected
    // to BOOLEAN. If the column is still integer, convert it in three steps:
    // drop the integer default, retype the column, restore the boolean default.
    version: 4,
    sql: `
      DO $$
      BEGIN
        IF (SELECT data_type FROM information_schema.columns
            WHERE table_name = 'stacks' AND column_name = 'is_modified') = 'integer' THEN
          ALTER TABLE stacks ALTER COLUMN is_modified DROP DEFAULT;
          ALTER TABLE stacks ALTER COLUMN is_modified TYPE BOOLEAN USING (is_modified != 0);
          ALTER TABLE stacks ALTER COLUMN is_modified SET DEFAULT FALSE;
        END IF;
      END $$;
    `,
  },
  {
    // Remove old bundled example stacks (GraphOfThrones, MedlinePlus) that were
    // shipped with earlier versions. Cascades to nodes, links, tags, etc.
    // If selected_stack_id pointed at one of these, buildGraphFromDb will find
    // an empty graph on next startup and fall back to the about stack.
    version: 5,
    sql: `DELETE FROM stacks WHERE name IN ('GraphOfThrones', 'MedlinePlus');`,
  },
  {
    version: 6,
    sql: `ALTER TABLE stacks ADD COLUMN IF NOT EXISTS stack_fields JSONB NOT NULL DEFAULT '{}';`,
  },
]
