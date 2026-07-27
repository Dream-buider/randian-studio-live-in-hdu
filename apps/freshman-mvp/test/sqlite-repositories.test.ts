import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import { SqliteReviewRepository } from '../src/repositories/sqlite-review-repository.js';

async function withTemporaryDatabase(
  run: (databasePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-sqlite-'));

  try {
    await run(path.join(directory, 'repository.db'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('SQLite content repository publishes only canonical approved answers', async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const db = openDatabase(databasePath);
    migrateDatabase(db);
    const content = new SqliteContentRepository(db);

    await content.createIntent({
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
    });
    assert.equal((await content.listPublishedQuestions()).length, 0);

    const answer = await content.publishCanonicalAnswer({
      intentId: 'campus-card',
      summary: '到校后按学院通知领取并激活校园一卡通。',
      fullAnswer: '到校后按学院通知领取并激活校园一卡通，具体地点以当年通知为准。',
      sources: [{ type: 'community', title: '新生指北', url: '', updatedAt: '2026-07-28' }],
      reviewerId: 'local-admin',
    });

    assert.equal(answer.version, 1);
    assert.deepEqual(await content.listPublishedQuestions(), [{
      id: 'campus-card',
      category: '校园生活',
      question: '校园一卡通如何领取？',
      summary: '到校后按学院通知领取并激活校园一卡通。',
      fullAnswer: '到校后按学院通知领取并激活校园一卡通，具体地点以当年通知为准。',
      sources: [{ type: 'community', title: '新生指北', url: '', updatedAt: '2026-07-28' }],
      trustStatus: 'approved',
      updatedAt: answer.updatedAt,
      featured: true,
      displayOrder: 1,
    }]);
    db.close();
  });
});

test('SQLite review repository preserves FIFO ordinals after reopening', async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const firstDb = openDatabase(databasePath);
    migrateDatabase(firstDb);
    const reviews = new SqliteReviewRepository(firstDb);

    await reviews.enqueue({
      question: '宿舍几点断电？',
      answer: '请以宿管通知为准。',
      sources: [],
    });
    await reviews.enqueue({
      question: '图书馆暑假开放吗？',
      answer: '请以图书馆公告为准。',
      sources: [],
    });
    firstDb.close();

    const reopenedDb = openDatabase(databasePath);
    migrateDatabase(reopenedDb);
    const reopenedReviews = new SqliteReviewRepository(reopenedDb);
    assert.deepEqual((await reopenedReviews.list()).map((item) => item.ordinal), [1, 2]);
    reopenedDb.close();
  });
});
