import type { PostgresPool } from './postgres.js';

const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS review_ordinal_seq;

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
  ordinal BIGINT NOT NULL UNIQUE DEFAULT nextval('review_ordinal_seq'),
  created_at TIMESTAMPTZ NOT NULL, decided_at TIMESTAMPTZ,
  reviewer_id TEXT, decision_note TEXT, reviewed_answer TEXT, feedback_target TEXT,
  provider_status TEXT CHECK (
    provider_status IS NULL OR provider_status IN (
      'available', 'not-configured', 'configuration-error', 'temporarily-unavailable'
    )
  ),
  raw_search_leads_json JSONB NOT NULL DEFAULT '[]'::jsonb
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
);
CREATE TABLE IF NOT EXISTS integration_outbox (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  intent_id TEXT NOT NULL REFERENCES question_intents(id) ON DELETE CASCADE,
  canonical_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leased_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS integration_outbox_claim_idx
  ON integration_outbox (status, available_at, created_at);
CREATE TABLE IF NOT EXISTS external_content_links (
  intent_id TEXT NOT NULL REFERENCES question_intents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_seq_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (intent_id, provider)
);
CREATE TABLE IF NOT EXISTS knowledge_imports (
  id UUID PRIMARY KEY,
  manifest_path TEXT NOT NULL,
  item_path TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('official', 'community', 'student')),
  source_url TEXT NOT NULL,
  published_at DATE NOT NULL,
  applicable_year INTEGER NOT NULL CHECK (applicable_year BETWEEN 2000 AND 2100),
  approved_by TEXT NOT NULL CHECK (length(btrim(approved_by)) > 0),
  approved_at TIMESTAMPTZ NOT NULL,
  ingest_mode TEXT NOT NULL CHECK (ingest_mode IN ('file', 'manual')),
  channel TEXT NOT NULL DEFAULT 'live-in-hdu-approved'
    CHECK (channel = 'live-in-hdu-approved'),
  knowledge_base_id TEXT NOT NULL,
  weknora_knowledge_id TEXT,
  parse_status TEXT NOT NULL CHECK (
    parse_status IN ('validated', 'pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (manifest_path, item_path, version),
  UNIQUE (manifest_path, item_path, approved_by, approved_at),
  UNIQUE (knowledge_base_id, content_sha256)
);
CREATE INDEX IF NOT EXISTS knowledge_imports_status_idx
  ON knowledge_imports (parse_status, updated_at DESC);
CREATE TABLE IF NOT EXISTS knowledge_import_events (
  id UUID PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES knowledge_imports(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN ('validated', 'pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS knowledge_import_events_import_idx
  ON knowledge_import_events (import_id, created_at);
`;

export async function migratePostgres(pool: PostgresPool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(POSTGRES_SCHEMA);
    await client.query('ALTER TABLE review_tasks ADD COLUMN IF NOT EXISTS provider_status TEXT');
    await client.query('ALTER TABLE review_tasks ADD COLUMN IF NOT EXISTS raw_search_leads_json JSONB');
    await client.query(
      `ALTER TABLE review_tasks
       ALTER COLUMN ordinal SET DEFAULT nextval('review_ordinal_seq')`,
    );
    await client.query(
      `SELECT setval(
        'review_ordinal_seq',
        GREATEST(COALESCE((SELECT MAX(ordinal) FROM review_tasks), 0), 1),
        COALESCE((SELECT MAX(ordinal) FROM review_tasks), 0) > 0
      )`,
    );
    await client.query(
      `UPDATE review_tasks
       SET raw_search_leads_json = '[]'::jsonb
       WHERE raw_search_leads_json IS NULL`,
    );
    await client.query(
      `ALTER TABLE review_tasks
       ALTER COLUMN raw_search_leads_json SET DEFAULT '[]'::jsonb,
       ALTER COLUMN raw_search_leads_json SET NOT NULL`,
    );
    await client.query(
      'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
      [1],
    );
    await client.query(
      'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
      [2],
    );
    await client.query(
      'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
      [3],
    );
    await client.query(
      'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
      [4],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
