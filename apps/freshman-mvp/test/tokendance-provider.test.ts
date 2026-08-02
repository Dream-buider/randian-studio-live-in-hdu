import assert from 'node:assert/strict';
import test from 'node:test';
import { TokenDanceProvider } from '../src/providers/tokendance-provider.js';

type FetchCall = { input: string; init: RequestInit };

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const intents = [{
  id: 'campus-card',
  externalId: 'Q01',
  category: '校园生活',
  question: '校园一卡通如何领取？',
  intentDescription: '首次领取校园卡',
  aliases: ['学校怎么办校园卡'],
  keywords: ['校园卡'],
  excludeKeywords: ['挂失'],
  active: true,
  featured: true,
  displayOrder: 1,
}];

test('TokenDance sends the exact endpoint, model, trimmed authorization, and safe body', async () => {
  const calls: FetchCall[] = [];
  const provider = new TokenDanceProvider({
    apiKey: '  test-key  ',
    fetch: async (input, init) => {
      calls.push({ input: String(input), init: init ?? {} });
      return response({
        choices: [{
          message: {
            content: '{"intentId":"campus-card","confidence":0.95,"reason":"语义一致"}',
          },
        }],
      });
    },
  });

  const result = await provider.classifyIntent('学校怎么办校园卡', intents);

  assert.deepEqual(result, {
    intentId: 'campus-card',
    confidence: 0.95,
    reason: '语义一致',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, 'https://tokendance.space/gateway/v1/chat/completions');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer test-key');
  const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
  assert.equal(body.model, 'deepseek-v4-flash');
  assert.equal(body.max_tokens, 192);
  assert.doesNotMatch(JSON.stringify(result), /test-key/);
  assert.doesNotMatch(JSON.stringify(body), /test-key/);
  assert.equal(provider.status().lastCallStatus, 'ok');
  assert.match(provider.status().lastCallAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
});

test('TokenDance rejects a whitespace-only key without revealing it', () => {
  assert.throws(
    () => new TokenDanceProvider({ apiKey: ' \t ' }),
    (error: unknown) => (
      error instanceof Error
      && error.message === 'TokenDance API key is required'
      && !error.message.includes('\t')
    ),
  );
});

test('TokenDance classification fails open for abort, non-2xx, invalid JSON, unknown IDs, and low confidence', async (t) => {
  const scenarios: Array<{
    name: string;
    fetch: typeof globalThis.fetch;
  }> = [
    {
      name: 'abort',
      fetch: async (_input, init) => {
        await new Promise<void>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('secret', 'AbortError')));
        });
        throw new Error('unreachable');
      },
    },
    { name: 'non-2xx', fetch: async () => response({ secret: 'do-not-return' }, 503) },
    {
      name: 'invalid JSON response',
      fetch: async () => new Response('not-json', { status: 200 }),
    },
    {
      name: 'unknown ID',
      fetch: async () => response({
        choices: [{ message: { content: '{"intentId":"unknown","confidence":0.99,"reason":"x"}' } }],
      }),
    },
    {
      name: 'low confidence',
      fetch: async () => response({
        choices: [{
          message: {
            content: '{"intentId":"campus-card","confidence":0.69,"reason":"不确定"}',
          },
        }],
      }),
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const provider = new TokenDanceProvider({
        apiKey: 'test-key',
        fetch: scenario.fetch,
        timeoutMs: scenario.name === 'abort' ? 5 : 20_000,
        confidenceThreshold: 0.7,
      });
      assert.equal(await provider.classifyIntent('问题', intents), null);
    });
  }
});
test('TokenDance synthesizes a non-empty answer from available or unavailable search state', async (t) => {
  for (const available of [true, false]) {
    await t.test(available ? 'available' : 'unavailable', async () => {
      let requestBody: Record<string, unknown> | undefined;
      const provider = new TokenDanceProvider({
        apiKey: 'test-key',
        fetch: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return response({
            choices: [{ message: { content: available ? '结合检索线索的回答。' : '基于现有常识的谨慎回答。' } }],
          });
        },
      });
      const result = await provider.synthesize({
        question: '食堂几点关门？',
        search: {
          status: available ? 'available' : 'temporarily-unavailable',
          leads: available
            ? [{
                title: '食堂通知',
                url: 'https://example.test',
                snippet: '营业时间以通知为准',
                engines: ['test'],
                retrievedAt: '2026-07-28T00:00:00.000Z',
              }]
            : [],
        },
      });
      assert.match(result.text, /回答/);
      assert.equal((requestBody as { model: string }).model, 'deepseek-v4-flash');
      assert.equal((requestBody as { max_tokens: number }).max_tokens, 800);
      assert.match(JSON.stringify(requestBody), available ? /食堂通知/ : /搜索服务当前不可用/);
    });
  }
});

test('TokenDance web synthesis forbids HDU-specific clubs and links absent from supplied evidence', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = new TokenDanceProvider({
    apiKey: 'test-key',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return response({
        choices: [{ message: { content: '仅依据输入线索回答。' } }],
      });
    },
  });

  await provider.synthesize({
    question: '给个社团的建议',
    search: {
      status: 'available',
      leads: [{
        title: '杭州电子科技大学校团委',
        url: 'https://tuanwei.hdu.edu.cn/',
        snippet: '社团安排以校团委最新通知为准。',
        engines: ['verified-fallback'],
        retrievedAt: '2026-08-02T00:00:00.000Z',
      }],
    },
  });

  const serialized = JSON.stringify(requestBody);
  assert.match(serialized, /不得提及输入标题、摘要和URL中不存在的具体社团名称、数量、公众号、网站或链接/);
  assert.match(serialized, /不得从URL路径推断日期/);
  assert.match(serialized, /网站存在通知公告等栏目，不代表该网站必然发布社团名单、招新、注册公示或联系方式/);
  assert.match(serialized, /输入未提供的杭电地点、时间、活动名称、部门或组织不得写入通用建议/);
  assert.match(serialized, /杭州电子科技大学校团委/);
  assert.doesNotMatch(serialized, /杭电轮滑社/);
});

test('TokenDance grounds knowledge synthesis in HDU hits without sending retrieval metadata', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = new TokenDanceProvider({
    apiKey: 'test-key',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return response({
        choices: [{ message: { content: '杭电宿舍由学校统一安排，具体以学院通知为准。' } }],
      });
    },
  });

  const result = await provider.synthesizeKnowledge({
    question: '杭电宿舍怎么安排？',
    hits: [{
      content: '宿舍由学校统一安排。',
      score: 0.91,
      knowledgeId: 'secret-knowledge-id',
      chunkId: 'secret-chunk-id',
      title: '杭电新生指北',
      sourceType: 'community',
      sequence: 3,
      source: {
        type: 'community',
        title: '杭电新生指北 · 宿舍',
        url: 'https://example.test/guide#dormitory',
        updatedAt: '2026-07-30',
      },
    }],
  });

  assert.equal(result.text, '杭电宿舍由学校统一安排，具体以学院通知为准。');
  assert.deepEqual(result.sources, []);
  const serialized = JSON.stringify(requestBody);
  for (const required of [
    '杭州电子科技大学',
    '不得把其他学校的普遍情况写成杭电事实',
    '只能依据输入知识片段',
    '通用建议必须单独标注',
  ]) {
    assert.match(serialized, new RegExp(required));
  }
  assert.match(serialized, /宿舍由学校统一安排/);
  assert.doesNotMatch(serialized, /secret-knowledge-id|secret-chunk-id|sourceType|sequence|score/);
});
