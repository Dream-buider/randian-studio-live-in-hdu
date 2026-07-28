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
import { TokenDanceProvider } from '../src/providers/tokendance-provider.js';
import type {
  KnowledgeProvider,
  ModelProvider,
  SearchProvider,
} from '../src/providers/contracts.js';
import { UnavailableSearchProvider } from '../src/providers/unavailable-search-provider.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import { SqliteReviewRepository } from '../src/repositories/sqlite-review-repository.js';
import { createApp } from '../src/server/app.js';
import type { AppConfig } from '../src/server/config.js';
import {
  AnswerRouter,
  DISCLAIMER,
  isUsableAnswer,
} from '../src/services/answer-router.js';
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

const CONFIG = {
  host: '127.0.0.1',
  port: 3210,
  databasePath: 'runtime/test.db',
  publicDir: 'dist/client',
  modelApiKey: '',
  modelEnabled: false,
  requestTimeoutMs: 20_000,
  knowledgeProvider: 'local',
  weknoraBaseUrl: 'http://127.0.0.1:8080/api/v1',
  weknoraApiKey: '',
  weknoraDocumentKbId: '',
  weknoraFaqKbId: '',
  weknoraScoreThreshold: 0.55,
  searchProvider: 'unavailable',
  searxngBaseUrl: 'http://127.0.0.1:8888',
  searchTimeoutMs: 10_000,
  searchMaxResults: 6,
  disclaimer: DISCLAIMER,
} satisfies AppConfig;

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
    knowledge?: KnowledgeProvider;
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

test('router v2 recognizes exact and alias variants only for active published presets', async () => {
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

test('router v2 uses model understanding for natural rewrites but rejects unknown, inactive, and unpublished intent IDs', async () => {
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

    assert.equal((await router.answer('请问新生的一卡通应该到哪里领取呢')).route, 'preset');
    assert.equal((await router.answer('第二种完全改写')).route, 'web');
    assert.equal((await router.answer('第三种完全改写')).route, 'web');
    assert.equal((await router.answer('第四种完全改写')).route, 'web');
  });
});

test('router v2 conservative local matching does not collide with adjacent card and network topics', async () => {
  await withRepositories(async ({ content, reviews }) => {
    await content.createIntent(baseIntent);
    await content.publishCanonicalAnswer({
      intentId: baseIntent.id,
      summary: '校园卡领取摘要。',
      fullAnswer: '按学院通知领取校园卡。',
      sources: [source],
      reviewerId: 'admin',
    });
    const router = makeRouter(content, reviews, {
      knowledge: new LocalKnowledgeProvider([{
        question: '校园卡如何领取？',
        aliases: ['学校怎么办校园卡'],
        keywords: ['校园卡', '领取'],
        excludeKeywords: ['密码', '饭卡', '银行卡', '校园网'],
        answer: '知识库中的校园卡领取回答。',
        sources: [source],
      }]),
    });

    for (const question of ['食堂饭卡怎么办', '校园网怎么办', '银行卡怎么办', '校园卡密码是什么']) {
      const result = await router.answer(question);
      assert.equal(result.route, 'web', question);
      assert.notEqual(result.answer, '按学院通知领取校园卡。', question);
      assert.notEqual(result.answer, '知识库中的校园卡领取回答。', question);
    }
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
          return { status: 'available', leads: [] };
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

test('router v2 accepts status-aware WeKnora chunks while provider failure falls through safely', async () => {
  await withRepositories(async ({ content, reviews }) => {
    let searchCalls = 0;
    const statusKnowledge: KnowledgeProvider = {
      async search() {
        return {
          status: 'available',
          hits: [{
            content: '宿舍通常按学院和专业统一安排。',
            score: 0.91,
            knowledgeId: 'knowledge-1',
            chunkId: 'chunk-1',
            title: '2025年新生指南',
            sourceType: 'community',
            sequence: 0,
            source: {
              type: 'community',
              title: '2025年新生指南',
              url: '',
              updatedAt: null,
            },
          }],
        };
      },
    };
    const router = makeRouter(content, reviews, {
      knowledge: statusKnowledge,
      search: {
        async search() {
          searchCalls += 1;
          return { status: 'not-configured', leads: [] };
        },
      },
    });
    const result = await router.answer('宿舍怎么安排？');
    assert.deepEqual(result, {
      route: 'knowledge',
      trustStatus: 'knowledge',
      answer: '宿舍通常按学院和专业统一安排。',
      sources: [{
        type: 'community',
        title: '2025年新生指南',
        url: '',
        updatedAt: null,
      }],
    });
    assert.equal(searchCalls, 0);

    const unavailable = makeRouter(content, reviews, {
      knowledge: {
        async search() {
          return { status: 'temporarily-unavailable', hits: [] };
        },
      },
      search: {
        async search() {
          searchCalls += 1;
          return { status: 'not-configured', leads: [] };
        },
      },
    });
    assert.equal((await unavailable.answer('另一个未知问题')).route, 'web');
    assert.equal(searchCalls, 1);
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
          engines: ['test'],
          retrievedAt: '2026-07-28T00:00:00.000Z',
        };
        const provider = model({
          async synthesize({ search }) {
            assert.equal(search.status === 'available', available);
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
            ? { async search() { return { status: 'available' as const, leads: [searchItem] }; } }
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
        const pending = await reviews.list('pending');
        assert.equal(pending.length, 1);
        assert.equal(
          pending[0].providerStatus,
          available ? 'available' : 'not-configured',
        );
        assert.deepEqual(
          pending[0].rawSearchLeads,
          available ? [searchItem] : [],
        );
      });
    });
  }
});

test('router v2 usable-answer gate rejects blank, uncollected, uncertain, and AI refusal boilerplate', () => {
  for (const unusable of [
    '',
    '   ',
    '这个问题未收录。',
    '抱歉，我无法回答这个问题。',
    '不知道答案。',
    '这个情况暂时无法确定。',
    '作为AI，我没有相关信息。',
  ]) {
    assert.equal(isUsableAnswer(unusable), false, unusable);
  }
  assert.equal(
    isUsableAnswer('具体安排请通过学校官网、学院通知或辅导员核验；问题已经进入审核队列。'),
    true,
  );
});

test('router v2 converts TokenDance failures and unusable text into HTTP 200 tracked fallback answers', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const timeoutFetch: typeof globalThis.fetch = async (_input, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')));
      });
      throw new Error('unreachable');
    };
    const scenarios: Array<{ name: string; provider: ModelProvider }> = [
      {
        name: 'timeout',
        provider: new TokenDanceProvider({ apiKey: 'test-key', fetch: timeoutFetch, timeoutMs: 5 }),
      },
      {
        name: 'non-2xx',
        provider: new TokenDanceProvider({
          apiKey: 'test-key',
          fetch: async () => new Response('upstream detail', { status: 503 }),
        }),
      },
      {
        name: 'invalid JSON',
        provider: new TokenDanceProvider({
          apiKey: 'test-key',
          fetch: async () => new Response('not-json', { status: 200 }),
        }),
      },
      {
        name: 'throw',
        provider: model({
          async synthesize() {
            throw new Error('provider secret');
          },
        }),
      },
      ...[
        ' ',
        '这个问题未收录。',
        '不知道答案。',
        '这个情况暂时无法确定。',
        '作为AI，我没有相关信息。',
      ].map((text) => ({
        name: text || 'blank',
        provider: model({ async synthesize() { return { text, sources: [] }; } }),
      })),
    ];

    for (const scenario of scenarios) {
      const router = makeRouter(content, reviews, { model: scenario.provider });
      const app = createApp({ config: CONFIG, content, reviews, router });
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/ask',
          payload: { question: `未知问题-${scenario.name}` },
        });
        assert.equal(response.statusCode, 200, scenario.name);
        const body = response.json();
        assert.equal(body.route, 'web', scenario.name);
        assert.ok(body.answer.trim(), scenario.name);
        assert.equal(isUsableAnswer(body.answer), true, scenario.name);
        assert.equal(body.disclaimer, DISCLAIMER, scenario.name);
      } finally {
        await app.close();
      }
    }
    assert.equal((await reviews.list('pending')).length, scenarios.length);
  });
});

test('router v2 deterministic fallback uses only real search evidence or official verification channels', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const brokenModel = model({
      async synthesize() {
        throw new Error('model unavailable');
      },
    });
    const searchItem = {
      title: '学校公开通知',
      url: 'https://example.test/official-notice',
      snippet: '办理地点以学院迎新通知为准',
      engines: ['test'],
      retrievedAt: '2026-07-28T00:00:00.000Z',
    };
    const available = makeRouter(content, reviews, {
      model: brokenModel,
      search: { async search() { return { status: 'available' as const, leads: [searchItem] }; } },
    });
    const withEvidence = await available.answer('未知办理问题');
    assert.equal(withEvidence.route, 'web');
    assert.match(withEvidence.answer, /办理地点以学院迎新通知为准/);
    assert.deepEqual(withEvidence.sources, [{
      type: 'web',
      title: searchItem.title,
      url: searchItem.url,
      updatedAt: null,
    }]);
    assert.doesNotMatch(withEvidence.answer, /未提供的事实|搜索到了其他/);

    const unavailable = makeRouter(content, reviews, {
      model: brokenModel,
      search: new UnavailableSearchProvider(),
    });
    const officialFallback = await unavailable.answer('另一个未知办理问题');
    assert.equal(officialFallback.route, 'web');
    assert.match(officialFallback.answer, /学校官网/);
    assert.match(officialFallback.answer, /学院通知/);
    assert.match(officialFallback.answer, /辅导员/);
    assert.match(officialFallback.answer, /审核队列/);
    assert.deepEqual(officialFallback.sources, []);
    assert.equal(isUsableAnswer(officialFallback.answer), true);
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
    const app = createApp({ config: CONFIG, content, reviews, router });
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
