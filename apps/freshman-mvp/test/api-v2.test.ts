import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import type { QuestionIntent, SourceRef } from '../src/domain/models.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import { SqliteReviewRepository } from '../src/repositories/sqlite-review-repository.js';
import type { AppConfig } from '../src/server/config.js';
import { createApp } from '../src/server/app.js';

const CONFIG: AppConfig = {
  host: '127.0.0.1',
  port: 3210,
  databasePath: 'runtime/test.db',
  publicDir: 'dist/client',
  modelBaseUrl: 'https://model.invalid/v1',
  modelApiKey: '',
  modelId: 'deepseek-v4-flash',
  modelEnabled: false,
  requestTimeoutMs: 20_000,
  disclaimer: '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别',
};

const SOURCES: SourceRef[] = [{
  type: 'community',
  title: '新生指北',
  url: '',
  updatedAt: '2026-07-28',
}];

const ACTIVE_INTENT: QuestionIntent = {
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

async function withApp(
  run: (context: {
    app: ReturnType<typeof createApp>;
    content: SqliteContentRepository;
    reviews: SqliteReviewRepository;
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-api-'));
  const database = openDatabase(path.join(directory, 'api.db'));
  migrateDatabase(database);
  const content = new SqliteContentRepository(database);
  const reviews = new SqliteReviewRepository(database);
  const app = createApp({
    config: CONFIG,
    content,
    reviews,
    router: {
      async answer(question: string) {
        return { route: 'knowledge', trustStatus: 'knowledge', answer: question, sources: [] };
      },
    },
  });

  try {
    await run({ app, content, reviews });
  } finally {
    await app.close();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test('publication API exposes only published active canonical answers', async () => {
  await withApp(async ({ app, content }) => {
    await content.createIntent(ACTIVE_INTENT);

    const publicBefore = await app.inject({ method: 'GET', url: '/api/questions' });
    assert.equal(publicBefore.statusCode, 200);
    assert.deepEqual(publicBefore.json(), { items: [] });

    const publish = await app.inject({
      method: 'POST',
      url: '/api/admin/intents/campus-card/publish',
      payload: {
        summary: '到校后请按学院通知领取并及时激活校园一卡通。',
        fullAnswer: '到校后请按学院通知领取并激活校园一卡通，具体地点以当年通知为准。',
        sources: SOURCES,
        reviewerId: 'local-admin',
      },
    });
    assert.equal(publish.statusCode, 200);
    assert.equal(publish.json().version, 1);

    const publicAfter = await app.inject({ method: 'GET', url: '/api/questions' });
    assert.equal(publicAfter.statusCode, 200);
    assert.equal(publicAfter.json().items.length, 1);
    assert.equal(publicAfter.json().items[0].id, 'campus-card');
    assert.equal(publicAfter.json().items[0].trustStatus, 'approved');
  });
});

test('publication API creates immutable versions on repeated publication', async () => {
  await withApp(async ({ app, content }) => {
    await content.createIntent(ACTIVE_INTENT);
    const payload = {
      summary: '到校后请按学院通知领取并及时激活校园一卡通。',
      fullAnswer: '第一版完整回答。',
      sources: SOURCES,
      reviewerId: 'local-admin',
    };

    const first = await app.inject({
      method: 'POST',
      url: '/api/admin/intents/campus-card/publish',
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/admin/intents/campus-card/publish',
      payload: { ...payload, fullAnswer: '第二版完整回答。' },
    });

    assert.equal(first.statusCode, 200);
    assert.equal(first.json().version, 1);
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().version, 2);
    assert.notEqual(first.json().id, second.json().id);
  });
});

test('publication API counts trimmed Unicode code points at 19/20/150/151 boundaries', async () => {
  await withApp(async ({ app, content }) => {
    await content.createIntent(ACTIVE_INTENT);
    const publish = (summary: string) => app.inject({
      method: 'POST',
      url: '/api/admin/intents/campus-card/publish',
      payload: {
        summary,
        fullAnswer: '有效的完整回答。',
        sources: SOURCES,
        reviewerId: 'local-admin',
      },
    });

    const nineteen = await publish('新'.repeat(19));
    const twentyWithEmoji = await publish(` ${'新'.repeat(19)}😀 `);
    const oneHundredFifty = await publish('新'.repeat(150));
    const oneHundredFiftyOne = await publish('新'.repeat(151));

    assert.equal(nineteen.statusCode, 400);
    assert.equal(nineteen.json().error.code, 'VALIDATION_ERROR');
    assert.equal(twentyWithEmoji.statusCode, 200);
    assert.equal(twentyWithEmoji.json().summary, `${'新'.repeat(19)}😀`);
    assert.equal(oneHundredFifty.statusCode, 200);
    assert.equal(oneHundredFiftyOne.statusCode, 400);
    assert.equal(oneHundredFiftyOne.json().error.code, 'VALIDATION_ERROR');
  });
});

test('publication API rejects blank answers, absent or invalid sources, and blank reviewers', async () => {
  await withApp(async ({ app, content }) => {
    await content.createIntent(ACTIVE_INTENT);
    const valid = {
      summary: '这是一个正好足够长且可供发布使用的新生问题摘要。',
      fullAnswer: '有效的完整回答。',
      sources: SOURCES,
      reviewerId: 'local-admin',
    };
    const invalidPayloads = [
      { ...valid, fullAnswer: ' \n ' },
      { ...valid, sources: [] },
      {
        ...valid,
        sources: [{ type: 'community', title: '缺少字段', url: '' }],
      },
      {
        ...valid,
        sources: [{ type: 'unknown', title: '错误来源', url: '', updatedAt: null }],
      },
      { ...valid, sources: [{ type: 'community', title: ' ', url: '', updatedAt: null }] },
      { ...valid, reviewerId: '  ' },
    ];

    for (const payload of invalidPayloads) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/intents/campus-card/publish',
        payload,
      });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
      assert.equal(response.json().error.code, 'VALIDATION_ERROR');
    }
  });
});

test('publication API rejects missing and inactive intents without creating answers', async () => {
  await withApp(async ({ app, content }) => {
    await content.createIntent({ ...ACTIVE_INTENT, id: 'inactive', active: false });
    const payload = {
      summary: '这是一个正好足够长且可供发布使用的新生问题摘要。',
      fullAnswer: '有效的完整回答。',
      sources: SOURCES,
      reviewerId: 'local-admin',
    };

    const missing = await app.inject({
      method: 'POST',
      url: '/api/admin/intents/missing/publish',
      payload,
    });
    const inactive = await app.inject({
      method: 'POST',
      url: '/api/admin/intents/inactive/publish',
      payload,
    });

    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'NOT_FOUND');
    assert.equal(inactive.statusCode, 409);
    assert.equal(inactive.json().error.code, 'CONFLICT');
    assert.deepEqual(await content.listPublishedQuestions(), []);
  });
});

test('publication API exposes a dynamic admin workspace and raw evidence provenance', async () => {
  await withApp(async ({ app, content }) => {
    const intents = [
      ACTIVE_INTENT,
      {
        ...ACTIVE_INTENT,
        id: 'dormitory',
        externalId: 'Q08',
        question: '宿舍条件怎么样？',
        displayOrder: 8,
        featured: false,
      },
      {
        ...ACTIVE_INTENT,
        id: 'major-transfer',
        externalId: 'Q15',
        question: '转专业需要什么条件？',
        displayOrder: 15,
        featured: false,
      },
    ];
    for (const intent of intents) {
      await content.createIntent(intent);
    }
    await content.upsertRawAnswers([{
      id: 'raw-q08-e2',
      intentId: 'dormitory',
      answer: '滨江校区多数为六人间，具体以当年安排为准。',
      sourceLabel: '学长学姐回答（一）',
      sourceCell: 'E9',
      createdAt: '2026-07-28T01:00:00.000Z',
    }]);
    await content.publishCanonicalAnswer({
      intentId: 'campus-card',
      summary: '校园卡领取与激活摘要。',
      fullAnswer: '校园卡领取与激活完整回答。',
      sources: SOURCES,
      reviewerId: 'local-admin',
    });

    const workspace = await app.inject({ method: 'GET', url: '/api/admin/intents' });
    assert.equal(workspace.statusCode, 200);
    assert.equal(workspace.json().items.length, 3);
    assert.deepEqual(
      workspace.json().items.map((item: { id: string }) => item.id),
      ['campus-card', 'dormitory', 'major-transfer'],
    );
    assert.equal(
      workspace.json().items.find((item: { id: string }) => item.id === 'dormitory').rawAnswerCount,
      1,
    );
    assert.equal(
      workspace.json().items.find((item: { id: string }) => item.id === 'dormitory').publishedAnswer,
      null,
    );
    assert.equal(
      workspace.json().items.find((item: { id: string }) => item.id === 'campus-card')
        .publishedAnswer.id,
      'campus-card',
    );

    const rawAnswers = await app.inject({
      method: 'GET',
      url: '/api/admin/intents/dormitory/raw-answers',
    });
    assert.equal(rawAnswers.statusCode, 200);
    assert.deepEqual(rawAnswers.json(), {
      items: [{
        id: 'raw-q08-e2',
        intentId: 'dormitory',
        answer: '滨江校区多数为六人间，具体以当年安排为准。',
        sourceLabel: '学长学姐回答（一）',
        sourceCell: 'E9',
        createdAt: '2026-07-28T01:00:00.000Z',
      }],
    });

    const missing = await app.inject({
      method: 'GET',
      url: '/api/admin/intents/not-present/raw-answers',
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'NOT_FOUND');
  });
});

test('publication API lists review tasks in repository FIFO order with an items envelope', async () => {
  await withApp(async ({ app, reviews }) => {
    const first = await reviews.enqueue({
      question: '第一个未收录问题',
      answer: '第一条临时回答',
      sources: [],
    });
    const second = await reviews.enqueue({
      question: '第二个未收录问题',
      answer: '第二条临时回答',
      sources: [],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/reviews?status=pending',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().items.map((item: { id: string; ordinal: number; status: string }) => ({
        id: item.id,
        ordinal: item.ordinal,
        status: item.status,
      })),
      [
        { id: first.id, ordinal: 1, status: 'pending' },
        { id: second.id, ordinal: 2, status: 'pending' },
      ],
    );
  });
});

test('review decision API persists a structured approved decision and rejects a second decision', async () => {
  await withApp(async ({ app, reviews }) => {
    const review = await reviews.enqueue({
      question: '图书馆暑假开放到几点？',
      answer: '请以图书馆当天公告为准。',
      sources: SOURCES,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.id}/decision`,
      payload: {
        status: 'approved',
        reviewerId: ' local-admin ',
        note: ' 已核对社区资料 ',
        reviewedAnswer: ' 图书馆开放时间会按假期安排调整，请查看当天公告。 ',
        feedbackTarget: ' community-knowledge ',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      item: {
        ...review,
        status: 'approved',
        decidedAt: response.json().item.decidedAt,
        reviewerId: 'local-admin',
        decisionNote: '已核对社区资料',
        reviewedAnswer: '图书馆开放时间会按假期安排调整，请查看当天公告。',
        feedbackTarget: 'community-knowledge',
      },
    });
    assert.match(response.json().item.decidedAt, /^\d{4}-\d{2}-\d{2}T/);

    const listed = await reviews.list('approved');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].reviewedAnswer, '图书馆开放时间会按假期安排调整，请查看当天公告。');
    assert.equal(listed[0].feedbackTarget, 'community-knowledge');

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.id}/decision`,
      payload: {
        status: 'rejected',
        reviewerId: 'local-admin',
        note: '不应覆盖已有决策',
        reviewedAnswer: null,
        feedbackTarget: 'discard',
      },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.json().error.code, 'CONFLICT');

    const missing = await app.inject({
      method: 'POST',
      url: '/api/reviews/not-present/decision',
      payload: {
        status: 'rejected',
        reviewerId: 'local-admin',
        note: '不存在',
        reviewedAnswer: null,
        feedbackTarget: 'discard',
      },
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'NOT_FOUND');
  });
});

test('review decision API validates status, reviewer, note, reviewed answer, and feedback target', async () => {
  await withApp(async ({ app, reviews }) => {
    const review = await reviews.enqueue({
      question: '未收录问题',
      answer: '临时回答',
      sources: [],
    });
    const valid = {
      status: 'needs_more',
      reviewerId: 'local-admin',
      note: '还需要学校官方资料',
      reviewedAnswer: '当前只能确认部分信息，需要继续补充。',
      feedbackTarget: 'official-source-followup',
    };
    const invalidPayloads = [
      { ...valid, status: 'pending' },
      { ...valid, status: 'unknown' },
      { ...valid, reviewerId: ' \n ' },
      { ...valid, note: '  ' },
      { ...valid, reviewedAnswer: ' ' },
      { ...valid, feedbackTarget: '' },
      { ...valid, status: 'approved', reviewedAnswer: null },
      null,
    ];

    for (const payload of invalidPayloads) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/reviews/${review.id}/decision`,
        payload,
      });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
      assert.equal(response.json().error.code, 'VALIDATION_ERROR');
    }

    assert.equal((await reviews.list('pending')).length, 1);
  });
});

test('review decision API survives database reopen with reviewed answer and feedback target intact', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-review-decision-'));
  const databasePath = path.join(directory, 'reviews.db');
  let database = openDatabase(databasePath);
  migrateDatabase(database);
  let reviews = new SqliteReviewRepository(database);
  const review = await reviews.enqueue({
    question: '校医院周末开放吗？',
    answer: '请先查看校医院通知。',
    sources: [],
  });
  const app = createApp({
    config: CONFIG,
    content: new SqliteContentRepository(database),
    reviews,
    router: { async answer() { return {}; } },
  });

  try {
    const decided = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review.id}/decision`,
      payload: {
        status: 'needs_more',
        reviewerId: 'local-admin',
        note: '等待校医院最新值班表',
        reviewedAnswer: '现有信息不足，请优先查看校医院当天通知。',
        feedbackTarget: 'official-health-center',
      },
    });
    assert.equal(decided.statusCode, 200);
    await app.close();
    database.close();

    database = openDatabase(databasePath);
    migrateDatabase(database);
    reviews = new SqliteReviewRepository(database);
    const [persisted] = await reviews.list('needs_more');
    assert.equal(persisted.id, review.id);
    assert.equal(persisted.reviewedAnswer, '现有信息不足，请优先查看校医院当天通知。');
    assert.equal(persisted.feedbackTarget, 'official-health-center');
  } finally {
    await app.close();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('publication API delegates questions through the supplied narrow answer contract', async () => {
  await withApp(async ({ app }) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: { question: '  学校怎么办校园卡  ' },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      route: 'knowledge',
      trustStatus: 'knowledge',
      answer: '学校怎么办校园卡',
      sources: [],
    });
  });
});

test('publication API wraps 404, malformed input, and internal failures without leaking diagnostics', async () => {
  await withApp(async ({ app, content, reviews }) => {
    const notFound = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    assert.equal(notFound.statusCode, 404);
    assert.deepEqual(notFound.json(), {
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });

    const malformed = await app.inject({
      method: 'POST',
      url: '/api/admin/intents/anything/publish',
      headers: { 'content-type': 'application/json' },
      payload: '{"summary":',
    });
    assert.equal(malformed.statusCode, 400);
    assert.deepEqual(malformed.json(), {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
    });

    const failingContent = Object.create(content) as SqliteContentRepository;
    failingContent.listPublishedQuestions = async () => {
      throw new Error(
        'SQLITE_CANTOPEN D:\\private\\live-in-hdu.db TOKENDANCE_API_KEY=top-secret',
      );
    };
    const failingApp = createApp({
      config: { ...CONFIG, modelApiKey: 'top-secret', modelEnabled: true },
      content: failingContent,
      reviews,
      router: { async answer() { throw new Error('unused'); } },
    });
    try {
      const internal = await failingApp.inject({ method: 'GET', url: '/api/questions' });
      assert.equal(internal.statusCode, 500);
      assert.deepEqual(internal.json(), {
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
      assert.doesNotMatch(internal.body, /SQLITE|D:\\|TOKENDANCE|top-secret|stack/i);
    } finally {
      await failingApp.close();
    }
  });
});

test('publication API keeps admin and review routes loopback-only while public routes remain LAN-accessible', async () => {
  await withApp(async ({ app }) => {
    const remoteAddress = '192.168.10.88';
    const publicQuestions = await app.inject({
      method: 'GET',
      url: '/api/questions',
      remoteAddress,
    });
    const publicAsk = await app.inject({
      method: 'POST',
      url: '/api/ask',
      remoteAddress,
      payload: { question: '学校怎么办校园卡' },
    });
    assert.equal(publicQuestions.statusCode, 200);
    assert.equal(publicAsk.statusCode, 200);

    for (const url of ['/api/admin/intents', '/api/reviews?status=pending']) {
      const denied = await app.inject({ method: 'GET', url, remoteAddress });
      assert.equal(denied.statusCode, 403);
      assert.deepEqual(denied.json(), {
        error: { code: 'FORBIDDEN', message: 'Local access only' },
      });
    }

    const nestedReviewDenied = await app.inject({
      method: 'POST',
      url: '/api/reviews/arbitrary/decision',
      remoteAddress,
      headers: {
        'x-forwarded-for': '127.0.0.1',
        forwarded: 'for=127.0.0.1',
      },
      payload: {
        status: 'rejected',
        reviewerId: 'local-admin',
        note: 'remote attempt',
        reviewedAnswer: null,
        feedbackTarget: 'discard',
      },
    });
    assert.equal(nestedReviewDenied.statusCode, 403);
    assert.equal(nestedReviewDenied.json().error.code, 'FORBIDDEN');

    for (const loopback of [
      '127.0.0.1',
      '127.0.0.2',
      '::1',
      '0:0:0:0:0:0:0:1',
      '::ffff:127.0.0.1',
      '::ffff:127.0.0.2',
      '::ffff:7f00:2',
    ]) {
      const allowed = await app.inject({
        method: 'GET',
        url: '/api/admin/intents',
        remoteAddress: loopback,
      });
      assert.equal(allowed.statusCode, 200, loopback);
    }

    const spoofedForwardedFor = await app.inject({
      method: 'GET',
      url: '/api/admin/intents',
      remoteAddress,
      headers: { 'x-forwarded-for': '127.0.0.1' },
    });
    assert.equal(spoofedForwardedFor.statusCode, 403);
    assert.equal(spoofedForwardedFor.json().error.code, 'FORBIDDEN');

    const loopbackDecision = await app.inject({
      method: 'POST',
      url: '/api/reviews/not-present/decision',
      remoteAddress: '127.0.0.2',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: {
        status: 'rejected',
        reviewerId: 'local-admin',
        note: 'loopback remains authoritative',
        reviewedAnswer: null,
        feedbackTarget: 'discard',
      },
    });
    assert.equal(loopbackDecision.statusCode, 404);
  });
});

test('publication API preserves safe Fastify 413 and 415 statuses without exposing diagnostics', async () => {
  await withApp(async ({ app }) => {
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/ask',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ question: '问'.repeat(1_100_000) }),
    });
    assert.equal(oversized.statusCode, 413);
    assert.deepEqual(oversized.json(), {
      error: { code: 'CLIENT_ERROR', message: 'Request could not be processed' },
    });

    const unsupported = await app.inject({
      method: 'POST',
      url: '/api/ask',
      headers: { 'content-type': 'application/xml' },
      payload: '<question>学校怎么办校园卡</question>',
    });
    assert.equal(unsupported.statusCode, 415);
    assert.deepEqual(unsupported.json(), {
      error: { code: 'CLIENT_ERROR', message: 'Request could not be processed' },
    });

    assert.doesNotMatch(
      `${oversized.body}\n${unsupported.body}`,
      /FST_ERR|body is too large|unsupported media type|application\/xml|stack/i,
    );
  });
});
