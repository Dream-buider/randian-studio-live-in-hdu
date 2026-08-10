import type { SqliteDatabase } from './sqlite.js';

const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_intents (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  intent_description TEXT NOT NULL,
  aliases_json TEXT NOT NULL,
  keywords_json TEXT NOT NULL,
  exclude_keywords_json TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  featured INTEGER NOT NULL CHECK (featured IN (0, 1)),
  display_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intent_aliases (
  intent_id TEXT NOT NULL REFERENCES question_intents(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  PRIMARY KEY (intent_id, alias)
);

CREATE TABLE IF NOT EXISTS raw_answers (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES question_intents(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_cell TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_answers (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES question_intents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  summary TEXT NOT NULL,
  full_answer TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'published', 'needs_update', 'disabled')),
  reviewer_id TEXT NOT NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (intent_id, version)
);

CREATE TABLE IF NOT EXISTS canonical_answer_sources (
  canonical_answer_id TEXT NOT NULL REFERENCES canonical_answers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  updated_at TEXT,
  PRIMARY KEY (canonical_answer_id, position)
);

CREATE TABLE IF NOT EXISTS review_tasks (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'needs_more')),
  ordinal INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  reviewer_id TEXT,
  decision_note TEXT,
  reviewed_answer TEXT,
  feedback_target TEXT,
  provider_status TEXT CHECK (
    provider_status IS NULL OR provider_status IN (
      'available', 'not-configured', 'configuration-error', 'temporarily-unavailable'
    )
  ),
  raw_search_leads_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roommate_registrations (
  id TEXT PRIMARY KEY,
  campus_code TEXT NOT NULL,
  template_version TEXT NOT NULL,
  room_key TEXT NOT NULL,
  building_key TEXT NOT NULL,
  address_ciphertext TEXT NOT NULL,
  nickname_ciphertext TEXT NOT NULL,
  contact_type TEXT,
  contact_ciphertext TEXT,
  contact_digest TEXT,
  management_digest TEXT NOT NULL UNIQUE,
  consent_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','hidden','deleted','expired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS roommate_registrations_room_status
  ON roommate_registrations(room_key, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS roommate_registrations_active_contact
  ON roommate_registrations(contact_digest)
  WHERE contact_digest IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS roommate_sessions (
  session_digest TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES roommate_registrations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roommate_admin_audit (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

function addColumnIfMissing(database: SqliteDatabase, table: string, column: string, definition: string): void {
  const existing = database.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
  if (!existing) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export function migrateDatabase(database: SqliteDatabase): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(INITIAL_SCHEMA);
    addColumnIfMissing(database, 'review_tasks', 'reviewed_answer', 'reviewed_answer TEXT');
    addColumnIfMissing(database, 'review_tasks', 'feedback_target', 'feedback_target TEXT');
    addColumnIfMissing(
      database,
      'review_tasks',
      'provider_status',
      `provider_status TEXT CHECK (
        provider_status IS NULL OR provider_status IN (
          'available', 'not-configured', 'configuration-error', 'temporarily-unavailable'
        )
      )`,
    );
    addColumnIfMissing(
      database,
      'review_tasks',
      'raw_search_leads_json',
      `raw_search_leads_json TEXT NOT NULL DEFAULT '[]'`,
    );
    database.prepare(
      'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    ).run(1, new Date().toISOString());
    database.prepare(
      'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    ).run(2, new Date().toISOString());
    database.prepare(
      'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    ).run(3, new Date().toISOString());
    database.prepare(
      'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    ).run(4, new Date().toISOString());
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
