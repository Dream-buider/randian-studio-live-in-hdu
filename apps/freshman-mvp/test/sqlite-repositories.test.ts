import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
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

test('SQLite review decisions persist the reviewed answer and feedback target', async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const db = openDatabase(databasePath);
    migrateDatabase(db);
    const reviews = new SqliteReviewRepository(db);
    try {
      const pending = await reviews.enqueue({
        question: '校园卡在哪里补办？',
        answer: '请咨询学院。',
        sources: [],
      });

      const decided = await reviews.decide(pending.id, {
        status: 'needs_more',
        reviewerId: 'local-admin',
        note: '补充校区和办理时间。',
        reviewedAnswer: '校园卡补办地点以校园卡服务中心当年通知为准。',
        feedbackTarget: 'knowledge-base',
      });

      assert.equal(decided.reviewedAnswer, '校园卡补办地点以校园卡服务中心当年通知为准。');
      assert.equal(decided.feedbackTarget, 'knowledge-base');
    } finally {
      db.close();
    }
  });
});

test('SQLite review repository waits for another connection and keeps distinct FIFO ordinals', async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const firstDb = openDatabase(databasePath);
    migrateDatabase(firstDb);
    const firstReviews = new SqliteReviewRepository(firstDb);
    let secondDb: ReturnType<typeof openDatabase> | null = null;
    let lockHolder: Worker | null = null;
    try {
      await firstReviews.enqueue({
        question: '第一条排队问题',
        answer: '第一条临时回答',
        sources: [],
      });

      lockHolder = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(workerData.databasePath);
      db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 1000; BEGIN IMMEDIATE;');
      parentPort.postMessage('locked');
      setTimeout(() => {
        db.exec('COMMIT');
        db.close();
        parentPort.postMessage('released');
      }, 75);
    `, { eval: true, workerData: { databasePath } });
      await once(lockHolder, 'message');

      secondDb = openDatabase(databasePath);
      const secondReviews = new SqliteReviewRepository(secondDb);
      const second = await secondReviews.enqueue({
        question: '第二条排队问题',
        answer: '第二条临时回答',
        sources: [],
      });
      await once(lockHolder, 'exit');

      assert.equal(second.ordinal, 2);
      assert.deepEqual((await secondReviews.list()).map((item) => item.ordinal), [1, 2]);
    } finally {
      secondDb?.close();
      firstDb.close();
      if (lockHolder) {
        await lockHolder.terminate();
      }
    }
  });
});

test('SQLite repositories reject null array inputs and malformed source references', async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const db = openDatabase(databasePath);
    migrateDatabase(db);
    const content = new SqliteContentRepository(db);
    const reviews = new SqliteReviewRepository(db);
    try {
      const input = {
      id: 'intent-validation',
      externalId: null,
      category: '测试',
      question: '数组字段验证？',
      intentDescription: '验证仓储边界拒绝错误数组。',
      aliases: ['别名'],
      keywords: ['关键字'],
      excludeKeywords: ['排除词'],
      active: true,
      featured: false,
      displayOrder: 1,
      };

      await assert.rejects(content.createIntent({ ...input, aliases: null } as never), /aliases/);
      await assert.rejects(content.createIntent({ ...input, keywords: null } as never), /keywords/);
      await assert.rejects(content.createIntent({ ...input, excludeKeywords: null } as never), /excludeKeywords/);
      await content.createIntent(input);
      await assert.rejects(content.publishCanonicalAnswer({
        intentId: input.id,
        summary: '摘要',
        fullAnswer: '完整回答',
        sources: null as never,
        reviewerId: 'local-admin',
      }), /sources/);
      await assert.rejects(reviews.enqueue({
        question: '来源校验？',
        answer: '临时回答',
        sources: [{ type: 'invalid', title: '错误来源', url: '', updatedAt: null }] as never,
      }), /source.*type/i);
    } finally {
      db.close();
    }
  });
});

test('SQLite published questions sort featured then display order across categories', async () => {
  await withTemporaryDatabase(async (databasePath) => {
    const db = openDatabase(databasePath);
    migrateDatabase(db);
    const content = new SqliteContentRepository(db);
    const sources = [{ type: 'official' as const, title: '校方通知', url: '', updatedAt: null }];
    const intents = [
      { id: 'featured-later', category: '乙类', displayOrder: 9, featured: true },
      { id: 'featured-earlier', category: '甲类', displayOrder: 2, featured: true },
      { id: 'regular-earlier', category: '甲类', displayOrder: 1, featured: false },
    ];
    try {
      for (const intent of intents) {
      await content.createIntent({
        ...intent,
        externalId: null,
        question: `${intent.id} 的问题？`,
        intentDescription: '用于跨分类排序的测试意图。',
        aliases: [],
        keywords: [],
        excludeKeywords: [],
        active: true,
      });
      await content.publishCanonicalAnswer({
        intentId: intent.id,
        summary: '这是用于验证排序规则的简短摘要。',
        fullAnswer: '这是用于验证排序规则的完整回答。',
        sources,
        reviewerId: 'local-admin',
      });
      }

      assert.deepEqual((await content.listPublishedQuestions()).map((item) => item.id), [
        'featured-earlier',
        'featured-later',
        'regular-earlier',
      ]);
    } finally {
      db.close();
    }
  });
});
