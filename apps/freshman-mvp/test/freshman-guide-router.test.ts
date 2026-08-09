import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import type { QuestionIntent, SourceRef } from '../src/domain/models.js';
import type {
  GuideSynthesisResult,
  KnowledgeHit,
  KnowledgeProvider,
  ModelProvider,
  SearchProvider,
} from '../src/providers/contracts.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import { SqliteReviewRepository } from '../src/repositories/sqlite-review-repository.js';
import { AnswerRouter, DISCLAIMER } from '../src/services/answer-router.js';
import { IntentMatcher } from '../src/services/intent-matcher.js';

const presetSource: SourceRef = {
  type: 'official',
  title: '校园卡办理通知',
  url: 'https://example.test/campus-card',
  updatedAt: '2026-08-01',
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
    async synthesize() { return { text: '联网回答。', sources: [] }; },
    ...overrides,
  };
}

function source(title: string, url: string, type: SourceRef['type'] = 'community'): SourceRef {
  return { type, title, url, updatedAt: '2026-07-30' };
}

function guideHit(
  chunkId: string,
  content: string,
  hitSource: SourceRef = source(`指北 ${chunkId}`, `https://example.test/guide#${chunkId}`),
  sequence = 0,
): KnowledgeHit {
  return {
    content,
    score: 0.9,
    knowledgeId: 'freshman-guide-2026',
    chunkId,
    title: hitSource.title,
    sourceType: hitSource.type,
    sequence,
    source: hitSource,
  };
}

function availableGuide(...hits: KnowledgeHit[]): KnowledgeProvider {
  return {
    async search() {
      return { status: 'available', hits };
    },
  };
}

async function withRepositories(
  run: (context: {
    content: SqliteContentRepository;
    reviews: SqliteReviewRepository;
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-guide-router-'));
  const database = openDatabase(path.join(directory, 'router.db'));
  migrateDatabase(database);
  try {
    await run({
      content: new SqliteContentRepository(database),
      reviews: new SqliteReviewRepository(database),
    });
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function makeRouter(
  content: SqliteContentRepository,
  reviews: SqliteReviewRepository,
  options: {
    model?: ModelProvider;
    guideKnowledge?: KnowledgeProvider;
    knowledge?: KnowledgeProvider;
    search?: SearchProvider;
  } = {},
): AnswerRouter {
  const modelProvider = options.model ?? model();
  return new AnswerRouter({
    content,
    reviews,
    intentMatcher: new IntentMatcher(modelProvider, 0.7),
    guideKnowledge: options.guideKnowledge ?? {
      async search() { return { status: 'not-configured', hits: [] }; },
    },
    knowledge: options.knowledge ?? { async search() { return null; } },
    search: options.search ?? {
      async search() { return { status: 'not-configured', leads: [] }; },
    },
    model: modelProvider,
    disclaimer: DISCLAIMER,
  });
}

test('preset answer stays the exact prefix while guide text and new sources are appended', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const originalAnswer = '按学院通知领取并激活校园卡。';
    const sharedGuideSource = source(presetSource.title, presetSource.url, 'community');
    const uniqueGuideSource = source('杭电新生指北 · 一卡通', 'https://example.test/guide#card');
    await content.createIntent(baseIntent);
    await content.publishCanonicalAnswer({
      intentId: baseIntent.id,
      summary: '校园卡领取摘要。',
      fullAnswer: originalAnswer,
      sources: [presetSource],
      reviewerId: 'admin',
    });
    const router = makeRouter(content, reviews, {
      model: model({
        async synthesizeGuide() {
          return { text: '指北还建议提前准备证件照。', selectedChunkIds: ['shared', 'unique'] };
        },
      }),
      guideKnowledge: availableGuide(
        guideHit('shared', '提前准备证件照。', sharedGuideSource),
        guideHit('unique', '按通知激活一卡通。', uniqueGuideSource, 1),
      ),
    });

    const result = await router.answer('学校怎么办校园卡');

    assert.equal(result.route, 'preset');
    assert.equal(result.trustStatus, 'approved');
    assert.equal(result.intentId, baseIntent.id);
    assert.equal(result.answer.startsWith(originalAnswer), true);
    assert.match(result.answer, /\n\n《杭电新生指北》补充：指北还建议提前准备证件照。/u);
    assert.deepEqual(result.sources, [presetSource, uniqueGuideSource]);
  });
});

test('guide-only answer uses the knowledge route without disclaimer or review task', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const guideSource = source('杭电新生指北 · 宿舍', 'https://example.test/guide#dormitory');
    const router = makeRouter(content, reviews, {
      model: model({
        async synthesizeGuide() {
          return { text: '宿舍由学校统一安排。', selectedChunkIds: ['dormitory'] };
        },
      }),
      guideKnowledge: availableGuide(guideHit('dormitory', '宿舍由学校统一安排。', guideSource)),
    });

    const result = await router.answer('宿舍怎么安排？');

    assert.equal(result.route, 'knowledge');
    assert.equal(result.trustStatus, 'knowledge');
    assert.equal('disclaimer' in result, false);
    assert.deepEqual(result.sources, [guideSource]);
    assert.equal((await reviews.list('pending')).length, 0);
  });
});

test('guide synthesis maps known selected IDs back to server hits in hit order', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const firstSource = source('杭电新生指北 · 学号', 'https://example.test/guide#student-id');
    const secondSource = source('杭电新生指北 · 钉钉认证', 'https://example.test/guide#dingtalk');
    const unselectedSource = source('杭电新生指北 · 缴费', 'https://example.test/guide#payment');
    const router = makeRouter(content, reviews, {
      model: model({
        async synthesizeGuide() {
          return {
            text: '先获取学号，再完成钉钉认证。',
            selectedChunkIds: ['dingtalk', 'unknown', 'student-id'],
            sources: [source('模型编造来源', 'https://invented.example/source', 'web')],
          } as GuideSynthesisResult & { sources: SourceRef[] };
        },
      }),
      guideKnowledge: availableGuide(
        guideHit('student-id', '先获取学号。', firstSource),
        guideHit('dingtalk', '再完成钉钉认证。', secondSource, 1),
        guideHit('payment', '最后核对缴费状态。', unselectedSource, 2),
      ),
    });

    const result = await router.answer('入学前先做什么？');

    assert.equal(result.answer, '先获取学号，再完成钉钉认证。');
    assert.deepEqual(result.sources, [firstSource, secondSource]);
  });
});

test('guide synthesis failure falls back to the first two sentence units from the top three hits', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const sources = [
      source('杭电新生指北 · 第一节', 'https://example.test/guide#one'),
      source('杭电新生指北 · 第二节', 'https://example.test/guide#two'),
      source('杭电新生指北 · 第三节', 'https://example.test/guide#three'),
      source('杭电新生指北 · 第四节', 'https://example.test/guide#four'),
    ];
    const router = makeRouter(content, reviews, {
      model: model({
        async synthesizeGuide() { throw new Error('model unavailable'); },
      }),
      guideKnowledge: availableGuide(
        guideHit('one', '第一句。第二句！第三句？', sources[0]),
        guideHit('two', '；第四句；第五句。第六句！', sources[1], 1),
        guideHit('three', '第七句？第八句！第九句。', sources[2], 2),
        guideHit('four', '不应进入摘要。', sources[3], 3),
      ),
    });

    const result = await router.answer('新生要做哪些准备？');

    assert.equal(result.answer, '第一句。第二句！\n\n第四句；第五句。\n\n第七句？第八句！');
    assert.equal(Array.from(result.answer).length <= 700, true);
    assert.deepEqual(result.sources, sources.slice(0, 3));
  });
});

test('deterministic guide truncation attributes only hits that contribute Unicode code points', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const firstSource = source('杭电新生指北 · 超长片段', 'https://example.test/guide#long');
    const secondSource = source('杭电新生指北 · 第二片段', 'https://example.test/guide#second');
    const thirdSource = source('杭电新生指北 · 第三片段', 'https://example.test/guide#third');
    const router = makeRouter(content, reviews, {
      model: model({
        async synthesizeGuide() { throw new Error('model unavailable'); },
      }),
      guideKnowledge: availableGuide(
        guideHit('long', `${'😀'.repeat(700)}。第二句。`, firstSource),
        guideHit('second', '这个片段不应贡献文本。', secondSource, 1),
        guideHit('third', '这个片段也不应贡献文本。', thirdSource, 2),
      ),
    });

    const result = await router.answer('超长指北问题');

    assert.equal(result.answer, '😀'.repeat(700));
    assert.equal(Array.from(result.answer).length, 700);
    assert.deepEqual(result.sources, [firstSource]);
  });
});

test('guide synthesis containing a model-generated URL is rejected for deterministic fallback', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const guideSource = source('杭电新生指北 · 报到', 'https://example.test/guide#check-in');
    const router = makeRouter(content, reviews, {
      model: model({
        async synthesizeGuide() {
          return {
            text: '请访问 https://invented.example/check-in 办理报到。',
            selectedChunkIds: ['check-in'],
          };
        },
      }),
      guideKnowledge: availableGuide(
        guideHit('check-in', '报到安排以学院通知为准。提前准备录取通知书。', guideSource),
      ),
    });

    const result = await router.answer('报到要准备什么？');

    assert.equal(result.answer, '报到安排以学院通知为准。提前准备录取通知书。');
    assert.doesNotMatch(result.answer, /https?:\/\//iu);
    assert.deepEqual(result.sources, [guideSource]);
  });
});

test('guide miss preserves existing knowledge precedence over web search', async () => {
  await withRepositories(async ({ content, reviews }) => {
    let webSearchCalls = 0;
    const localSource = source('本地知识库', 'https://example.test/local');
    const router = makeRouter(content, reviews, {
      guideKnowledge: availableGuide(),
      knowledge: {
        async search() {
          return { answer: '本地知识库回答。', sources: [localSource] };
        },
      },
      search: {
        async search() {
          webSearchCalls += 1;
          return { status: 'available', leads: [] };
        },
      },
    });

    const result = await router.answer('食堂几点关门？');

    assert.deepEqual(result, {
      route: 'knowledge',
      trustStatus: 'knowledge',
      answer: '本地知识库回答。',
      sources: [localSource],
    });
    assert.equal(webSearchCalls, 0);
  });
});

test('guide and knowledge misses preserve the web disclaimer and enqueue exactly one review', async () => {
  await withRepositories(async ({ content, reviews }) => {
    const lead = {
      title: '学校公开通知',
      url: 'https://example.test/notice',
      snippet: '请以学院通知为准。',
      engines: ['test'],
      retrievedAt: '2026-08-10T00:00:00.000Z',
    };
    const router = makeRouter(content, reviews, {
      guideKnowledge: availableGuide(),
      knowledge: { async search() { return null; } },
      search: {
        async search() { return { status: 'available', leads: [lead] }; },
      },
    });

    const result = await router.answer('一个都未命中的问题');

    assert.equal(result.route, 'web');
    assert.equal(result.disclaimer, DISCLAIMER);
    assert.equal(result.reviewOrdinal, 1);
    assert.equal((await reviews.list('pending')).length, 1);
  });
});

test('guide provider failure leaves preset answers intact and non-presets continue downstream', async () => {
  await withRepositories(async ({ content, reviews }) => {
    await content.createIntent(baseIntent);
    await content.publishCanonicalAnswer({
      intentId: baseIntent.id,
      summary: '校园卡领取摘要。',
      fullAnswer: '预设回答。',
      sources: [presetSource],
      reviewerId: 'admin',
    });
    let guideCalls = 0;
    const router = makeRouter(content, reviews, {
      guideKnowledge: {
        async search() {
          guideCalls += 1;
          throw new Error('guide unavailable');
        },
      },
      knowledge: {
        async search() {
          return { answer: '后续知识库回答。', sources: [] };
        },
      },
    });

    const preset = await router.answer('学校怎么办校园卡');
    const downstream = await router.answer('食堂几点关门？');

    assert.equal(preset.route, 'preset');
    assert.equal(preset.answer, '预设回答。');
    assert.equal(downstream.route, 'knowledge');
    assert.equal(downstream.answer, '后续知识库回答。');
    assert.equal(guideCalls, 2);
    assert.equal((await reviews.list('pending')).length, 0);
  });
});
