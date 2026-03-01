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
]
