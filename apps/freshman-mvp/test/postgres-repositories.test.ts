import assert from 'node:assert/strict';
import test from 'node:test';
import { migratePostgres } from '../src/db/postgres-migrations.js';
import { PostgresContentRepository } from '../src/repositories/postgres-content-repository.js';
import { PostgresReviewRepository } from '../src/repositories/postgres-review-repository.js';

type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number | null };

class FakeClient {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];
  released = false;
  private readonly results: QueryResult[];

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

const intent = {
  id: 'campus-card',
  externalId: 'Q01',
  category: '校园生活',
  question: '校园一卡通如何领取？',
  intentDescription: '新生首次领取和激活校园卡',
  aliases: ['学校怎么办校园卡'],
  keywords: ['校园卡', '一卡通'],
  excludeKeywords: ['挂失'],
  active: true,
  featured: true,
  displayOrder: 1,
};

test('Postgres content repository persists an intent and publishes the next answer version atomically', async () => {
  const pool = new FakePool([], [
    { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] },
    { rows: [] }, { rows: [{ id: intent.id }], rowCount: 1 }, { rows: [] }, { rows: [{ version: 2 }] },
    { rows: [{ id: 'campus-card:v3', intent_id: 'campus-card', version: 3, summary: '领取后激活。', full_answer: '领取后按通知激活校园一卡通。', sources_json: JSON.stringify([]), status: 'published', reviewer_id: 'admin', published_at: '2026-07-28T00:00:00.000Z', updated_at: '2026-07-28T00:00:00.000Z' }] }, { rows: [] },
  ]);
  const content = new PostgresContentRepository(pool as never);

  await content.createIntent(intent);
  const published = await content.publishCanonicalAnswer({
    intentId: intent.id,
    summary: '领取后激活。',
    fullAnswer: '领取后按通知激活校园一卡通。',
    sources: [],
    reviewerId: 'admin',
  });

  assert.equal(published.version, 3);
  assert.equal(published.status, 'published');
  assert.ok(pool.client.queries.some(({ text }) => text.includes('INSERT INTO question_intents')));
  assert.deepEqual(pool.client.queries.map(({ text }) => text).filter((text) => text === 'BEGIN' || text === 'COMMIT'), ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']);
  assert.equal(pool.client.released, true);
});

test('Postgres review repository allocates a FIFO ordinal inside one transaction', async () => {
  const pool = new FakePool([], [
    { rows: [] }, { rows: [] }, { rows: [{ ordinal: 7 }] },
    { rows: [{ id: 'review-7', question: '宿舍几点断电？', answer_text: '请以宿管通知为准。', sources_json: '[]', risk_level: 'medium', status: 'pending', ordinal: 7, created_at: '2026-07-28T00:00:00.000Z', decided_at: null, reviewer_id: null, decision_note: null, reviewed_answer: null, feedback_target: null, provider_status: 'available', raw_search_leads_json: JSON.stringify([{ title: '校方公告', url: 'https://example.edu/notice', snippet: '宿舍管理通知', engines: ['searxng'], retrievedAt: '2026-07-28T00:00:00.000Z' }]) }] }, { rows: [] },
  ]);
  const reviews = new PostgresReviewRepository(pool as never);

  const task = await reviews.enqueue({ question: '宿舍几点断电？', answer: '请以宿管通知为准。', sources: [], providerStatus: 'available', rawSearchLeads: [{ title: '校方公告', url: 'https://example.edu/notice', snippet: '宿舍管理通知', engines: ['searxng'], retrievedAt: '2026-07-28T00:00:00.000Z' }] });

  assert.equal(task.ordinal, 7);
  assert.equal(task.status, 'pending');
  assert.deepEqual(task.rawSearchLeads, [{ title: '校方公告', url: 'https://example.edu/notice', snippet: '宿舍管理通知', engines: ['searxng'], retrievedAt: '2026-07-28T00:00:00.000Z' }]);
  assert.equal(task.providerStatus, 'available');
  const insert = pool.client.queries.find(({ text }) => text.includes('INSERT INTO review_tasks'));
  assert.match(insert?.text ?? '', /provider_status/);
  assert.ok(insert?.values.includes('available'));
  assert.deepEqual(pool.client.queries.map(({ text }) => text).filter((text) => text === 'BEGIN' || text === 'COMMIT'), ['BEGIN', 'COMMIT']);
  assert.equal(pool.client.released, true);
});

test('Postgres migration defines the content and review schema without starting Docker', async () => {
  const pool = new FakePool();

  await migratePostgres(pool as never);

  const sql = pool.client.queries.map(({ text }) => text).join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS question_intents/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS review_tasks/);
  assert.match(sql, /UNIQUE \(intent_id, version\)/);
  assert.match(sql, /provider_status TEXT/);
  assert.match(sql, /raw_search_leads_json JSONB/);
});

test('real Postgres contract is skipped without PHASE_B_POSTGRES_TEST_URL', async (context) => {
  if (!process.env.PHASE_B_POSTGRES_TEST_URL) {
    context.skip('PHASE_B_POSTGRES_TEST_URL is not set; Docker and external Postgres are intentionally not started by this test.');
    return;
  }
  assert.match(process.env.PHASE_B_POSTGRES_TEST_URL, /^postgres(?:ql)?:\/\//);
});
