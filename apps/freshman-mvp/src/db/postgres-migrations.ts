import type { PostgresPool } from './postgres.js';

const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS question_intents (
  id TEXT PRIMARY KEY, external_id TEXT, category TEXT NOT NULL, question TEXT NOT NULL,
  intent_description TEXT NOT NULL, aliases_json JSONB NOT NULL, keywords_json JSONB NOT NULL,
  exclude_keywords_json JSONB NOT NULL, active BOOLEAN NOT NULL, featured BOOLEAN NOT NULL,
  display_order INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS intent_aliases (
  intent_id TEXT NOT NULL REFERENCES question_intents(id) ON DELETE CASCADE,
  alias TEXT NOT NULL, PRIMARY KEY (intent_id, alias)
);
CREATE TABLE IF NOT EXISTS raw_answers (
  id TEXT PRIMARY KEY, intent_id TEXT NOT NULL REFERENCES question_intents(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL, source_label TEXT NOT NULL, source_cell TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS canonical_answers (
  id TEXT PRIMARY KEY, intent_id TEXT NOT NULL REFERENCES question_intents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, summary TEXT NOT NULL, full_answer TEXT NOT NULL, sources_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'published', 'needs_update', 'disabled')),
  reviewer_id TEXT NOT NULL, published_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (intent_id, version)
);
CREATE TABLE IF NOT EXISTS canonical_answer_sources (
  canonical_answer_id TEXT NOT NULL REFERENCES canonical_answers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, source_type TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
  updated_at TIMESTAMPTZ, PRIMARY KEY (canonical_answer_id, position)
);
CREATE TABLE IF NOT EXISTS review_tasks (
  id UUID PRIMARY KEY, question TEXT NOT NULL, answer_text TEXT NOT NULL, sources_json JSONB NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'needs_more')),
  ordinal INTEGER NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL, decided_at TIMESTAMPTZ,
  reviewer_id TEXT, decision_note TEXT, reviewed_answer TEXT, feedback_target TEXT,
  provider_status TEXT, raw_search_leads_json JSONB
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY, conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  value TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);`;

export async function migratePostgres(pool: PostgresPool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(POSTGRES_SCHEMA);
    await client.query('ALTER TABLE review_tasks ADD COLUMN IF NOT EXISTS provider_status TEXT');
    await client.query('ALTER TABLE review_tasks ADD COLUMN IF NOT EXISTS raw_search_leads_json JSONB');
    await client.query(
      'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
      [1],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
