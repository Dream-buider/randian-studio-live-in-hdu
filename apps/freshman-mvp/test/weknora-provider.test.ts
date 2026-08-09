import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRESHMAN_GUIDE_URL,
  resolveFreshmanGuideSource,
} from '../src/content/freshman-guide.js';
import { WeKnoraProvider } from '../src/providers/weknora-provider.js';

const API_KEY = 'weknora-test-key-never-log';
const KB_IDS = ['kb-document-test', 'kb-faq-test'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('freshman guide sources use a section deep link, root fallback, or no match by title', () => {
  assert.deepEqual(
    resolveFreshmanGuideSource('杭电新生指北', '宿舍房型和宽带以现场安排为准。'),
    {
      type: 'community',
      title: '杭电新生指北 · 宿舍',
      url: `${FRESHMAN_GUIDE_URL}#SF3vdsZU3o6FouxCXabcyTnUnTb`,
      updatedAt: '2026-07-30',
    },
  );
  assert.deepEqual(
    resolveFreshmanGuideSource('杭电新生指北', '国家助学金申请以学校当年通知为准。'),
    {
      type: 'community',
      title: '杭电新生指北 · 助学政策',
      url: FRESHMAN_GUIDE_URL,
      updatedAt: '2026-07-30',
    },
  );
  assert.equal(
    resolveFreshmanGuideSource('校园 FAQ', '宿舍房型和宽带以现场安排为准。'),
    null,
  );
});

test('WeKnora provider sends the public retrieval contract and normalizes at most eight ordered chunks', async () => {
  const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
  const fetch: typeof globalThis.fetch = async (input, init = {}) => {
    calls.push({
      url: String(input),
      init,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    const data = Array.from({ length: 10 }, (_, index) => ({
      id: `chunk-${9 - index}`,
      content: `第 ${9 - index} 段校园资料`,
      knowledge_id: `knowledge-${index % 2}`,
      knowledge_title: index % 2 === 0 ? '2025年新生指南' : '校园 FAQ',
      knowledge_source: 'community',
      seq: 9 - index,
      score: 0.9,
    }));
    return jsonResponse({ success: true, data });
  };
  const provider = new WeKnoraProvider({
    baseUrl: 'http://127.0.0.1:8080/api/v1',
    apiKey: API_KEY,
    knowledgeBaseIds: KB_IDS,
    scoreThreshold: 0.55,
    fetch,
  });

  const result = await provider.search('宿舍条件怎么样？');
  assert.equal(result.status, 'available');
  assert.equal(result.hits.length, 8);
  assert.deepEqual(result.hits.map((hit) => hit.sequence), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(result.hits[0], {
    content: '第 0 段校园资料',
    score: 0.9,
    knowledgeId: 'knowledge-1',
    chunkId: 'chunk-0',
    title: '校园 FAQ',
    sourceType: 'community',
    sequence: 0,
    source: {
      type: 'community',
      title: '校园 FAQ',
      url: '',
      updatedAt: null,
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/knowledge-search');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).get('X-API-Key'), API_KEY);
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), null);
  assert.deepEqual(calls[0].body, {
    query: '宿舍条件怎么样？',
    knowledge_base_ids: KB_IDS,
  });
});

test('WeKnora resolves guide chunks to section anchors while preserving non-guide sources', async () => {
  const provider = new WeKnoraProvider({
    baseUrl: 'http://127.0.0.1:8080/api/v1',
    apiKey: API_KEY,
    knowledgeBaseIds: KB_IDS,
    sourceResolver: ({ title, content }) => resolveFreshmanGuideSource(title, content),
    fetch: async () => jsonResponse({
      success: true,
      data: [
        {
          id: 'guide-chunk',
          content: '宿舍房型和宽带以现场安排为准。',
          knowledge_id: 'guide-knowledge',
          knowledge_title: '杭电新生指北',
          knowledge_source: 'community',
          seq: 0,
          score: 0.9,
        },
        {
          id: 'faq-chunk',
          content: '校园卡由学院发放。',
          knowledge_id: 'faq-knowledge',
          knowledge_title: '校园 FAQ',
          knowledge_source: 'community',
          seq: 1,
          score: 0.8,
        },
      ],
    }),
  });

  const result = await provider.search('宿舍和校园卡');
  assert.equal(result.hits[0].source.type, 'community');
  assert.equal(
    result.hits[0].source.url,
    'https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd#SF3vdsZU3o6FouxCXabcyTnUnTb',
  );
  assert.equal(result.hits[0].source.updatedAt, '2026-07-30');
  assert.deepEqual(result.hits[1].source, {
    type: 'community',
    title: '校园 FAQ',
    url: '',
    updatedAt: null,
  });
});

test('WeKnora provider rejects blank, non-finite, and below-threshold chunks as an available miss', async () => {
  const provider = new WeKnoraProvider({
    baseUrl: 'http://127.0.0.1:8080/api/v1',
    apiKey: API_KEY,
    knowledgeBaseIds: KB_IDS,
    scoreThreshold: 0.55,
    fetch: async () => jsonResponse({
      success: true,
      data: [
        { id: 'blank', content: '   ', knowledge_id: 'k1', knowledge_title: 'A', seq: 0, score: 0.9 },
        { id: 'string-score', content: '有效文字', knowledge_id: 'k2', knowledge_title: 'B', seq: 1, score: '0.9' },
        { id: 'low', content: '低分文字', knowledge_id: 'k3', knowledge_title: 'C', seq: 2, score: 0.54 },
        { id: 'missing-id', content: '无追踪标识', knowledge_id: '', knowledge_title: 'D', seq: 3, score: 0.9 },
      ],
    }),
  });
  assert.deepEqual(await provider.search('没有合格结果'), {
    status: 'available',
    hits: [],
  });
});

test('WeKnora provider distinguishes missing configuration, authentication errors, and temporary failures', async (t) => {
  await t.test('not configured never calls fetch', async () => {
    let called = false;
    const provider = new WeKnoraProvider({
      baseUrl: '',
      apiKey: '',
      knowledgeBaseIds: [],
      fetch: async () => {
        called = true;
        throw new Error('must not call');
      },
    });
    assert.deepEqual(await provider.search('问题'), {
      status: 'not-configured',
      hits: [],
    });
    assert.equal(called, false);
  });

  for (const status of [401, 403]) {
    await t.test(`${status} is configuration-error`, async () => {
      const provider = new WeKnoraProvider({
        baseUrl: 'http://127.0.0.1:8080/api/v1',
        apiKey: API_KEY,
        knowledgeBaseIds: KB_IDS,
        fetch: async () => jsonResponse({ secret: API_KEY }, status),
      });
      assert.deepEqual(await provider.search('问题'), {
        status: 'configuration-error',
        hits: [],
      });
    });
  }

  for (const status of [429, 500, 503]) {
    await t.test(`${status} is temporarily-unavailable`, async () => {
      const provider = new WeKnoraProvider({
        baseUrl: 'http://127.0.0.1:8080/api/v1',
        apiKey: API_KEY,
        knowledgeBaseIds: KB_IDS,
        fetch: async () => jsonResponse({ secret: API_KEY }, status),
      });
      assert.deepEqual(await provider.search('问题'), {
        status: 'temporarily-unavailable',
        hits: [],
      });
    });
  }

  await t.test('invalid JSON and unsuccessful envelopes are temporarily-unavailable', async () => {
    const invalidJson = new WeKnoraProvider({
      baseUrl: 'http://127.0.0.1:8080/api/v1',
      apiKey: API_KEY,
      knowledgeBaseIds: KB_IDS,
      fetch: async () => new Response('not-json', { status: 200 }),
    });
    assert.equal((await invalidJson.search('问题')).status, 'temporarily-unavailable');
    const unsuccessful = new WeKnoraProvider({
      baseUrl: 'http://127.0.0.1:8080/api/v1',
      apiKey: API_KEY,
      knowledgeBaseIds: KB_IDS,
      fetch: async () => jsonResponse({ success: false, data: [] }),
    });
    assert.equal((await unsuccessful.search('问题')).status, 'temporarily-unavailable');
  });
});

test('WeKnora provider aborts within its timeout and never logs keys or error bodies', async () => {
  const logged: unknown[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...values: unknown[]) => void logged.push(...values);
  console.warn = (...values: unknown[]) => void logged.push(...values);
  try {
    const provider = new WeKnoraProvider({
      baseUrl: 'http://127.0.0.1:8080/api/v1',
      apiKey: API_KEY,
      knowledgeBaseIds: KB_IDS,
      timeoutMs: 10,
      fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error(`body ${API_KEY}`)));
      }),
    });
    assert.deepEqual(await provider.search('超时问题'), {
      status: 'temporarily-unavailable',
      hits: [],
    });
    assert.deepEqual(logged, []);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});
