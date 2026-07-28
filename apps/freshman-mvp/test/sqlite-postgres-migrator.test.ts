import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase } from '../src/db/migrations.js';
import { SqlitePostgresMigrator } from '../src/services/sqlite-postgres-migrator.js';
import { loadConfig } from '../src/server/config.js';

type QueryResult = { rows: Array<Record<string, unknown>>; rowCount: number };

class RecordingPostgresClient {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];
  readonly inserted = new Set<string>();
  released = false;

  async query(text: string, values: readonly unknown[] = []): Promise<QueryResult> {
    this.queries.push({ text, values });
    if (text.startsWith('SELECT COUNT(*)')) {
      const table = text.match(/FROM ([a-z_]+)/)?.[1] ?? 'unknown';
      const count = [...this.inserted].filter((key) => key.startsWith(`${table}:`)).length;
      return { rows: [{ count }], rowCount: 1 };
    }
    if (text.startsWith('INSERT INTO ')) {
      const table = text.match(/^INSERT INTO ([a-z_]+)/)?.[1] ?? 'unknown';
      const key = `${table}:${values.slice(0, table === 'intent_aliases' || table === 'canonical_answer_sources' ? 2 : 1).join(':')}`;
      if (this.inserted.has(key)) return { rows: [], rowCount: 0 };
      this.inserted.add(key);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  release(): void { this.released = true; }
}

class RecordingPostgresPool {
  readonly client = new RecordingPostgresClient();
  async connect(): Promise<RecordingPostgresClient> { return this.client; }
  async query(text: string, values: readonly unknown[] = []): Promise<QueryResult> {
    return this.client.query(text, values);
  }
}

function createSource(): DatabaseSync {
  const source = new DatabaseSync(':memory:');
  migrateDatabase(source);
  source.prepare(`INSERT INTO question_intents (id,external_id,category,question,intent_description,aliases_json,keywords_json,exclude_keywords_json,active,featured,display_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('q01', 'Q01', '报到', '如何报到？', '报到流程', '[]', '[]', '[]', 1, 1, 1, '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z');
  source.prepare(`INSERT INTO question_intents (id,external_id,category,question,intent_description,aliases_json,keywords_json,exclude_keywords_json,active,featured,display_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('q11', 'Q11', '网络', '校园网如何开通？', '校园网', '[]', '[]', '[]', 1, 0, 2, '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z');
  source.prepare('INSERT INTO raw_answers (id,intent_id,answer_text,source_label,source_cell,created_at) VALUES (?,?,?,?,?,?)').run('good', 'q01', '按录取通知书办理。', '回答（一）', 'E2', '2026-07-28T00:00:00.000Z');
  source.prepare('INSERT INTO raw_answers (id,intent_id,answer_text,source_label,source_cell,created_at) VALUES (?,?,?,?,?,?)').run('age-19', 'q01', '19', '回答（二）', 'F2', '2026-07-28T00:00:00.000Z');
  source.prepare('INSERT INTO raw_answers (id,intent_id,answer_text,source_label,source_cell,created_at) VALUES (?,?,?,?,?,?)').run('q11-evidence', 'q11', '不应自动发布。', '回答（一）', 'E3', '2026-07-28T00:00:00.000Z');
  return source;
}

test('SQLite to PostgreSQL migration dry-run is data-driven, preserves Q11 evidence, and reports suspicious 19', async () => {
  const source = createSource();
  const pool = new RecordingPostgresPool();
  try {
    const migrator = new SqlitePostgresMigrator(source, pool as never);
    const report = await migrator.migrate({ dryRun: true });

    assert.equal(report.sourceCounts.question_intents, 2);
    assert.equal(report.sourceCounts.raw_answers, 3);
    assert.equal(report.q11IntentCount, 1);
    assert.deepEqual(report.suspiciousRawAnswerIds, ['age-19']);
    assert.equal(report.transferredTotal, 0);
    assert.equal(pool.client.queries.length, 0);
  } finally { source.close(); }
});

test('SQLite to PostgreSQL migration uses foreign-key order and makes a second run idempotent', async () => {
  const source = createSource();
  const pool = new RecordingPostgresPool();
  try {
    const migrator = new SqlitePostgresMigrator(source, pool as never);
    const first = await migrator.migrate();
    const second = await migrator.migrate();
    const reconciliation = await migrator.reconcile();
    const writes = pool.client.queries.filter(({ text }) => text.startsWith('INSERT INTO '));

    assert.ok(first.transferredTotal > 0);
    assert.equal(second.transferredTotal, 0);
    assert.equal(reconciliation.matches, true);
    assert.deepEqual(reconciliation.sourceCounts, first.sourceCounts);
    assert.ok(writes.findIndex(({ text }) => text.startsWith('INSERT INTO question_intents')) < writes.findIndex(({ text }) => text.startsWith('INSERT INTO raw_answers')));
    assert.ok(writes.every(({ text }) => text.includes('ON CONFLICT')));
    assert.equal(pool.client.released, true);
  } finally { source.close(); }
});

test('database selection defaults to SQLite and only accepts PostgreSQL when explicitly configured', () => {
  const sqlite = loadConfig({}, 'D:/live-in-hdu');
  const postgres = loadConfig({ DATABASE_PROVIDER: 'postgres', POSTGRES_URL: 'postgresql://local/test' }, 'D:/live-in-hdu');

  assert.equal(sqlite.databaseProvider, 'sqlite');
  assert.equal(postgres.databaseProvider, 'postgres');
  assert.equal(postgres.postgresUrl, 'postgresql://local/test');
});
