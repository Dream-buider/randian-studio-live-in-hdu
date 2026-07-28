import assert from 'node:assert/strict';
import test from 'node:test';
import { migratePostgres } from '../src/db/postgres-migrations.js';
import { PostgresKnowledgeImportStore } from '../src/repositories/postgres-knowledge-import-store.js';

type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number | null };

class FakeClient {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];
  private readonly results: QueryResult[];
  released = false;

  constructor(results: QueryResult[] = []) {
    this.results = results;
  }

  async query(text: string, values: readonly unknown[] = []): Promise<QueryResult> {
    this.queries.push({ text, values });
    return this.results.shift() ?? { rows: [], rowCount: 1 };
  }

  release(): void {
    this.released = true;
  }
}

class FakePool extends FakeClient {
  readonly client: FakeClient;

  constructor(results: QueryResult[] = [], clientResults: QueryResult[] = []) {
    super(results);
    this.client = new FakeClient(clientResults);
  }

  async connect(): Promise<FakeClient> {
    return this.client;
  }
}

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  manifest_path: 'D:\\approved\\knowledge-manifest.json',
  item_path: 'guide.md',
  version: 2,
  content_sha256: 'a'.repeat(64),
  title: '2025年新生指南',
  source_type: 'community',
  source_url: '',
  published_at: '2025-08-01',
  applicable_year: 2025,
  approved_by: 'reviewer',
  approved_at: '2026-07-28T04:00:00.000Z',
  ingest_mode: 'file',
  knowledge_base_id: 'kb-documents',
  weknora_knowledge_id: 'knowledge-1',
  parse_status: 'completed',
  last_error: null,
  created_at: '2026-07-28T04:01:00.000Z',
  updated_at: '2026-07-28T04:02:00.000Z',
};

test('Postgres migration defines immutable knowledge import versions and append-only events', async () => {
  const pool = new FakePool();

  await migratePostgres(pool as never);

  const sql = pool.client.queries.map(({ text }) => text).join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS knowledge_imports/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS knowledge_import_events/);
  assert.match(sql, /UNIQUE \(manifest_path, item_path, version\)/);
  assert.match(sql, /UNIQUE \(manifest_path, item_path, approved_by, approved_at\)/);
  assert.match(sql, /UNIQUE \(knowledge_base_id, content_sha256\)/);
  assert.match(sql, /channel.*live-in-hdu-approved/);
});

test('Postgres knowledge import store creates a locked next version and retains trace fields', async () => {
  const pool = new FakePool(
    [
      { rows: [row] },
      { rows: [row] },
      { rows: [row] },
      { rows: [] },
    ],
    [
      { rows: [] },
      { rows: [{ version: 1 }] },
      { rows: [row], rowCount: 1 },
      { rows: [] },
    ],
  );
  const store = new PostgresKnowledgeImportStore(pool as never);

  const listed = await store.list();
  const byHash = await store.findByHash('kb-documents', 'a'.repeat(64));
  const approval = await store.findApproval(
    'D:\\approved\\knowledge-manifest.json',
    'guide.md',
    'reviewer',
    '2026-07-28T04:00:00.000Z',
  );
  const created = await store.createVersion({
    manifestPath: 'D:\\approved\\knowledge-manifest.json',
    itemPath: 'guide.md',
    contentSha256: 'b'.repeat(64),
    title: '2025年新生指南',
    sourceType: 'community',
    sourceUrl: '',
    publishedAt: '2025-08-01',
    applicableYear: 2025,
    approvedBy: 'reviewer-2',
    approvedAt: '2026-07-28T05:00:00.000Z',
    ingestMode: 'file',
    knowledgeBaseId: 'kb-documents',
  });
  await store.updateState(created.id, {
    weknoraKnowledgeId: 'knowledge-2',
    parseStatus: 'processing',
    lastError: null,
  });
  await store.appendEvent(created.id, 'processing', null);

  assert.equal(listed[0].contentSha256, 'a'.repeat(64));
  assert.equal(byHash?.weknoraKnowledgeId, 'knowledge-1');
  assert.equal(approval?.approvedBy, 'reviewer');
  assert.equal(created.version, 2);
  assert.equal(pool.client.released, true);
  assert.ok(pool.client.queries.some(({ text }) => /FOR UPDATE/i.test(text)));
  assert.deepEqual(
    pool.client.queries
      .map(({ text }) => text)
      .filter((text) => text === 'BEGIN' || text === 'COMMIT'),
    ['BEGIN', 'COMMIT'],
  );
  assert.ok(pool.queries.some(({ text }) => /UPDATE knowledge_imports/i.test(text)));
  assert.ok(pool.queries.some(({ text }) => /INSERT INTO knowledge_import_events/i.test(text)));
});
