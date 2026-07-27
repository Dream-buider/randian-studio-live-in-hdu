import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import { ServiceUnavailableError } from '../src/domain/errors.js';
import type { QuestionIntent, SourceRef } from '../src/domain/models.js';
import { LocalKnowledgeProvider } from '../src/providers/local-knowledge-provider.js';
import type {
  ModelProvider,
  SearchProvider,
} from '../src/providers/contracts.js';
import { UnavailableSearchProvider } from '../src/providers/unavailable-search-provider.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import { SqliteReviewRepository } from '../src/repositories/sqlite-review-repository.js';
import { createApp } from '../src/server/app.js';
import type { AppConfig } from '../src/server/config.js';
import { AnswerRouter, DISCLAIMER } from '../src/services/answer-router.js';
import { IntentMatcher } from '../src/services/intent-matcher.js';

const source: SourceRef = {
  type: 'community',
  title: '新生指北',
  url: '',
  updatedAt: '2026-07-28',
};

const baseIntent: QuestionIntent = {
  id: 'campus-card',
  externalId: 'Q01',
  category: '校园生活',
  question: '校园一卡通如何领取？',
  intentDescription: '首次领取并激活校园卡',
  aliases: ['学校怎么办校园卡'],
  keywords: ['校园卡', '一卡通'],
  excludeKeywords: ['挂失'],
  active: true,
  featured: true,
  displayOrder: 1,
};

function model(overrides: Partial<ModelProvider> = {}): ModelProvider {
  return {
    async classifyIntent() { return null; },
    async synthesize() {
      return { text: '模型给出的谨慎回答。', sources: [] };
    },
    ...overrides,
  };
}

async function withRepositories(
  run: (context: {
    databasePath: string;
    content: SqliteContentRepository;
    reviews: SqliteReviewRepository;
    close(): void;
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-router-v2-'));
  const databasePath = path.join(directory, 'router.db');
  const database = openDatabase(databasePath);
  migrateDatabase(database);
  try {
    await run({
      databasePath,
      content: new SqliteContentRepository(database),
      reviews: new SqliteReviewRepository(database),
      close: () => database.close(),
    });
  } finally {
    try { database.close(); } catch {}
    await rm(directory, { recursive: true, force: true });
  }
}

function makeRouter(
  content: SqliteContentRepository,
  reviews: SqliteReviewRepository,
  options: {
    model?: ModelProvider;
    knowledge?: LocalKnowledgeProvider;
    search?: SearchProvider;
  } = {},
): AnswerRouter {
  const modelProvider = options.model ?? model();
  return new AnswerRouter({
    content,
    reviews,
    intentMatcher: new IntentMatcher(modelProvider, 0.7),
    knowledge: options.knowledge ?? new LocalKnowledgeProvider([]),
    search: options.search ?? new UnavailableSearchProvider(),
    model: modelProvider,
    disclaimer: DISCLAIMER,
  });
}

test('router v2 recognizes exact, alias, and keyword variants only for active published presets', async () => {
  await withRepositories(async ({ content, reviews }) => {
    await content.createIntent(baseIntent);
    await content.createIntent({
      ...baseIntent,
      id: 'inactive',
      question: '图书馆在哪里？',
      aliases: ['图书馆怎么走'],
      keywords: ['图书馆'],
      excludeKeywords: [],
      active: false,
    });
    await content.createIntent({
      ...baseIntent,
      id: 'unpublished',
      question: '校医院在哪里？',
      aliases: ['校医院怎么走'],
      keywords: ['校医院'],
      excludeKeywords: [],
    });
    await content.publishCanonicalAnswer({
      intentId: baseIntent.id,
      summary: '校园卡领取摘要。',
      fullAnswer: '按学院通知领取并激活校园卡。',
      sources: [source],
      reviewerId: 'admin',
    });
    await content.publishCanonicalAnswer({
      intentId: 'inactive',
      summary: '图书馆位置摘要。',
      fullAnswer: '图书馆位置回答。',
      sources: [source],
      reviewerId: 'admin',
    });

    const router = makeRouter(content, reviews);
    for (const question of [
      '校园一卡通如何领取？',
      '学校怎么办校园卡',
      '请问新生的一卡通应该到哪里领取呢',
    ]) {
      const result = await router.answer(question);
      assert.equal(result.route, 'preset', question);
      assert.equal(result.answer, '按学院通知领取并激活校园卡。');
    }
    assert.equal((await router.answer('校园卡挂失怎么办')).route, 'web');
    assert.equal((await router.answer('图书馆怎么走')).route, 'web');
    assert.equal((await router.answer('校医院怎么走')).route, 'web');
  });
});

test('router v2 uses model understanding for rewrites but rejects unknown, inactive, and unpublished intent IDs', async () => {
  await withRepositories(async ({ content, reviews }) => {
    await content.createIntent(baseIntent);
    await content.createIntent({ ...baseIntent, id: 'inactive', active: false });
    await content.createIntent({ ...baseIntent, id: 'unpublished', question: '未发布问题' });
    await content.publishCanonicalAnswer({
      intentId: baseIntent.id,
      summary: '校园卡领取摘要。',
      fullAnswer: '已审核校园卡回答。',
      sources: [source],
      reviewerId: 'admin',
    });
    const classifications = ['campus-card', 'unknown', 'inactive', 'unpublished'];
    const provider = model({
      async classifyIntent() {
        return { intentId: classifications.shift() ?? null, confidence: 0.99, reason: '语义匹配' };
      },
    });
    const router = makeRouter(content, reviews, { model: provider });

    assert.equal((await router.answer('第一种完全改写')).route, 'preset');
    assert.equal((await router.answer('第二种完全改写')).route, 'web');
    assert.equal((await router.answer('第三种完全改写')).route, 'web');
    assert.equal((await router.answer('第四种完全改写')).route, 'web');
  });
});

test('router v2 preserves preset then knowledge precedence without calling downstream providers', async () => {
  await withRepositories(async ({ content, reviews }) => {
    await content.createIntent(baseIntent);
    await content.publishCanonicalAnswer({
      intentId: baseIntent.id,
      summary: '校园卡摘要。',
      fullAnswer: '预设回答。',
      sources: [source],
      reviewerId: 'admin',
    });
    let searchCalls = 0;
    let synthesisCalls = 0;
    const provider = model({
      async synthesize() {
        synthesisCalls += 1;
        return { text: '不应使用', sources: [] };
      },
    });
    const router = makeRouter(content, reviews, {
      model: provider,
      knowledge: new LocalKnowledgeProvider([{
        question: '食堂几点关门？',
        aliases: ['食堂营业到几点'],
        keywords: ['食堂', '关门'],
        excludeKeywords: [],
        answer: '食堂通常营业至晚间，具体以各档口为准。',
        sources: [source],
      }]),
      search: {
        async search() {
          searchCalls += 1;
          return { available: true, items: [] };
        },
      },
    });

    assert.equal((await router.answer('学校怎么办校园卡')).route, 'preset');
    assert.deepEqual(await router.answer('食堂营业到几点'), {
      route: 'knowledge',
      trustStatus: 'knowledge',
      answer: '食堂通常营业至晚间，具体以各档口为准。',
      sources: [source],
    });
    assert.equal(searchCalls, 0);
    assert.equal(synthesisCalls, 0);
  });
});

test('router v2 stage 3 handles available and unavailable search, persists first, and uses the exact disclaimer', async (t) => {
  for (const available of [true, false]) {
    await t.test(available ? 'available' : 'unavailable', async () => {
      await withRepositories(async ({ content, reviews }) => {
        let enqueued = false;
        const trackedReviews = Object.create(reviews) as SqliteReviewRepository;
        trackedReviews.enqueue = async (input) => {
          const item = await reviews.enqueue(input);
          enqueued = true;
          return item;
        };
        const searchItem = {
          title: '学校通知',
          url: 'https://example.test/notice',
          snippet: '以最新通知为准',
        };
        const provider = model({
          async synthesize({ search }) {
            assert.equal(search.available, available);
            return {
              text: available ? '根据检索线索形成的回答。' : '搜索暂不可用时形成的谨慎回答。',
              sources: available ? [{
                type: 'web',
                title: searchItem.title,
                url: searchItem.url,
                updatedAt: null,
              }] : [],
            };
          },
        });
        const router = new AnswerRouter({
          content,
          reviews: trackedReviews,
          intentMatcher: new IntentMatcher(provider, 0.7),
          knowledge: new LocalKnowledgeProvider([]),
          search: available
            ? { async search() { return { available: true, items: [searchItem] }; } }
            : new UnavailableSearchProvider(),
          model: provider,
          disclaimer: DISCLAIMER,
        });

        const result = await router.answer('一个未知问题');
        assert.equal(enqueued, true);
        assert.equal(result.route, 'web');
        assert.ok(result.answer.trim());
        assert.equal(result.disclaimer, '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别');
        assert.equal(result.reviewOrdinal, 1);
        assert.equal((await reviews.list('pending')).length, 1);
      });
    });
  }
});

test('router v2 rejects blank model answers and never returns an untracked answer', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const blankRouter = makeRouter(content, reviews, {
      model: model({ async synthesize() { return { text: '  ', sources: [] }; } }),
    });
    await assert.rejects(blankRouter.answer('未知问题'), ServiceUnavailableError);
    assert.equal((await reviews.list()).length, 0);

    const failingReviews = Object.create(reviews) as SqliteReviewRepository;
    failingReviews.enqueue = async () => { throw new Error('disk secret'); };
    const router = new AnswerRouter({
      content,
      reviews: failingReviews,
      intentMatcher: new IntentMatcher(model(), 0.7),
      knowledge: new LocalKnowledgeProvider([]),
      search: new UnavailableSearchProvider(),
      model: model(),
      disclaimer: DISCLAIMER,
    });
    await assert.rejects(
      router.answer('另一个未知问题'),
      (error: unknown) => (
        error instanceof ServiceUnavailableError
        && error.message === 'Answer review queue is temporarily unavailable'
        && !error.message.includes('disk')
      ),
    );
  });
});

test('router v2 never returns or queues an uncollected/refusal model answer', async () => {
  await withRepositories(async ({ content, reviews }) => {
    for (const forbidden of [
      '这个问题未收录。',
      '抱歉，我无法回答这个问题。',
    ]) {
      const router = makeRouter(content, reviews, {
        model: model({
          async synthesize() {
            return { text: forbidden, sources: [] };
          },
        }),
      });
      await assert.rejects(router.answer('未知问题'), ServiceUnavailableError);
    }
    assert.equal((await reviews.list()).length, 0);
  });
});

test('router v2 enqueue failure maps to HTTP 503 without exposing diagnostics', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const failingReviews = Object.create(reviews) as SqliteReviewRepository;
    failingReviews.enqueue = async () => { throw new Error('D:\\secret.db token=abc'); };
    const router = new AnswerRouter({
      content,
      reviews: failingReviews,
      intentMatcher: new IntentMatcher(model(), 0.7),
      knowledge: new LocalKnowledgeProvider([]),
      search: new UnavailableSearchProvider(),
      model: model(),
      disclaimer: DISCLAIMER,
    });
    const config = {
      host: '127.0.0.1',
      port: 3210,
      databasePath: 'runtime/test.db',
      publicDir: 'dist/client',
      modelBaseUrl: 'https://tokendance.space/gateway/v1',
      modelApiKey: '',
      modelId: 'deepseek-v4-flash',
      modelEnabled: false,
      requestTimeoutMs: 20_000,
      disclaimer: DISCLAIMER,
    } satisfies AppConfig;
    const app = createApp({ config, content, reviews, router });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ask',
        payload: { question: '未知问题' },
      });
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.json(), {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Answer service is temporarily unavailable',
        },
      });
      assert.doesNotMatch(response.body, /secret|token|D:\\/i);
    } finally {
      await app.close();
    }
  });
});

test('router v2 fallback ordinals stay FIFO across database reopen and intent count is dynamic', async () => {
  await withRepositories(async ({ databasePath, content, reviews, close }) => {
    for (let index = 0; index < 3; index += 1) {
      await content.createIntent({
        ...baseIntent,
        id: `dynamic-${index}`,
        question: `动态问题 ${index}`,
        aliases: [],
        keywords: [],
        excludeKeywords: [],
        displayOrder: index,
      });
    }
    const router = makeRouter(content, reviews);
    await router.answer('第一个未收录');
    await router.answer('第二个未收录');
    close();

    const reopened = openDatabase(databasePath);
    migrateDatabase(reopened);
    try {
      const reopenedReviews = new SqliteReviewRepository(reopened);
      assert.deepEqual((await reopenedReviews.list()).map((item) => item.ordinal), [1, 2]);
    } finally {
      reopened.close();
    }
  });
});
