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
  assert.doesNotMatch(JSON.stringify(result), /test-key/);
  assert.doesNotMatch(JSON.stringify(body), /test-key/);
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
          available,
          items: available
            ? [{ title: '食堂通知', url: 'https://example.test', snippet: '营业时间以通知为准' }]
            : [],
        },
      });
      assert.match(result.text, /回答/);
      assert.equal((requestBody as { model: string }).model, 'deepseek-v4-flash');
      assert.match(JSON.stringify(requestBody), available ? /食堂通知/ : /搜索服务当前不可用/);
    });
  }
});
