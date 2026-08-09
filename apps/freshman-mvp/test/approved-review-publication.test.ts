import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import { SqliteApprovedReviewPublisher } from '../src/repositories/sqlite-approved-review-publisher.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import { SqliteReviewRepository } from '../src/repositories/sqlite-review-repository.js';

async function withTemporaryDatabase(
  run: (database: ReturnType<typeof openDatabase>) => Promise<void>,
): Promise<void> {
  const tempRoot = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\temp';
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(path.join(tempRoot, 'approved-review-publication-'));
  const database = openDatabase(path.join(directory, 'publication.db'));
  migrateDatabase(database);
  try {
    await run(database);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test('approving a pending review publishes a new public question in the same operation', async () => {
  await withTemporaryDatabase(async (database) => {
    const reviews = new SqliteReviewRepository(database);
    const content = new SqliteContentRepository(database);
    const publisher = new SqliteApprovedReviewPublisher(database);
    const pending = await reviews.enqueue({
      question: '宿舍晚上几点熄灯？',
      answer: '请以宿管通知为准。',
      sources: [],
    });

    const result = await publisher.publish(pending.id, {
      status: 'approved',
      reviewerId: 'local-admin',
      note: '学长学姐经验审核通过。',
      reviewedAnswer: '宿舍晚上没有统一的熄灯时间，建议入住后与室友协商作息。',
      feedbackTarget: '补充问答',
    });

    assert.equal(result.review.status, 'approved');
    assert.equal(result.createdIntent, true);
    assert.equal(result.version, 1);
    assert.deepEqual(await content.listPublishedQuestions(), [{
      id: `review-${pending.id}`,
      category: '补充问答',
      question: '宿舍晚上几点熄灯？',
      summary: '宿舍晚上没有统一的熄灯时间，建议入住后与室友协商作息。',
      fullAnswer: '宿舍晚上没有统一的熄灯时间，建议入住后与室友协商作息。',
      sources: [],
      trustStatus: 'approved',
      updatedAt: result.review.decidedAt,
      featured: false,
      displayOrder: 1,
    }]);
  });
});

test('approving the same normalized question creates a new answer version without a duplicate card', async () => {
  await withTemporaryDatabase(async (database) => {
    const reviews = new SqliteReviewRepository(database);
    const content = new SqliteContentRepository(database);
    const publisher = new SqliteApprovedReviewPublisher(database);
    const first = await reviews.enqueue({ question: '宿舍晚上几点熄灯？', answer: '旧答复', sources: [] });
    const second = await reviews.enqueue({ question: ' 宿舍晚上几点熄灯? ', answer: '新答复', sources: [] });

    await publisher.publish(first.id, {
      status: 'approved', reviewerId: 'reviewer-a', note: '',
      reviewedAnswer: '第一版答案', feedbackTarget: '补充问答',
    });
    const result = await publisher.publish(second.id, {
      status: 'approved', reviewerId: 'reviewer-b', note: '修正',
      reviewedAnswer: '第二版答案', feedbackTarget: '补充问答',
    });

    assert.equal(result.createdIntent, false);
    assert.equal(result.version, 2);
    const questions = await content.listPublishedQuestions();
    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.fullAnswer, '第二版答案');
  });
});

test('publication failure rolls back the new card and leaves the review pending', async () => {
  await withTemporaryDatabase(async (database) => {
    const reviews = new SqliteReviewRepository(database);
    const content = new SqliteContentRepository(database);
    const publisher = new SqliteApprovedReviewPublisher(database);
    const pending = await reviews.enqueue({ question: '宿舍晚上几点熄灯？', answer: '待审核', sources: [] });
    database.exec(`
      CREATE TRIGGER force_publication_failure
      BEFORE INSERT ON canonical_answers
      BEGIN
        SELECT RAISE(ABORT, 'forced publication failure');
      END;
    `);

    await assert.rejects(() => publisher.publish(pending.id, {
      status: 'approved', reviewerId: 'local-admin', note: '',
      reviewedAnswer: '审核答案', feedbackTarget: '补充问答',
    }), /forced publication failure/u);

    assert.equal((await reviews.list('pending')).length, 1);
    assert.deepEqual(await content.listPublishedQuestions(), []);
  });
});

test('the same review task cannot be published twice', async () => {
  await withTemporaryDatabase(async (database) => {
    const reviews = new SqliteReviewRepository(database);
    const content = new SqliteContentRepository(database);
    const publisher = new SqliteApprovedReviewPublisher(database);
    const pending = await reviews.enqueue({ question: '宿舍晚上几点熄灯？', answer: '待审核', sources: [] });
    const decision = {
      status: 'approved' as const, reviewerId: 'local-admin', note: '',
      reviewedAnswer: '审核答案', feedbackTarget: '补充问答',
    };

    await publisher.publish(pending.id, decision);
    await assert.rejects(() => publisher.publish(pending.id, decision), /already been decided/u);
    assert.equal((await content.listPublishedQuestions()).length, 1);
  });
});
