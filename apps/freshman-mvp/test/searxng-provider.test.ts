import assert from 'node:assert/strict';
import test from 'node:test';
import { SearxngProvider } from '../src/providers/searxng-provider.js';

test('SearXNG provider encodes the query and returns at most six normalized leads', async () => {
  let requested = '';
  const provider = new SearxngProvider({
    baseUrl: 'http://127.0.0.1:8888',
    maxResults: 6,
    fetch: async (input) => {
      requested = String(input);
      return Response.json({
        results: Array.from({ length: 8 }, (_, index) => ({
          title: `通知 ${index}`,
          url: `https://www.hdu.edu.cn/notice/${index}`,
          content: `新生报到线索 ${index}`,
          engines: ['bing', 'duckduckgo'],
        })),
      });
    },
    now: () => new Date('2026-07-28T03:00:00.000Z'),
  });

  const result = await provider.search('杭州电子科技大学 新生报到 & 宿舍');

  assert.equal(result.status, 'available');
  assert.equal(result.leads.length, 6);
  assert.match(requested, /q=%E6%9D%AD%E5%B7%9E/);
  assert.match(requested, /format=json/);
  assert.match(requested, /language=zh-CN/);
  assert.match(requested, /safesearch=1/);
  assert.deepEqual(result.leads[0], {
    title: '通知 0',
    url: 'https://www.hdu.edu.cn/notice/0',
    snippet: '新生报到线索 0',
    engines: ['bing', 'duckduckgo'],
    retrievedAt: '2026-07-28T03:00:00.000Z',
  });
  assert.deepEqual(provider.status(), {
    status: 'configured',
    lastSearchStatus: 'available',
    lastSearchAt: '2026-07-28T03:00:00.000Z',
  });
});

test('SearXNG provider drops unsafe, duplicate, and unusable results', async () => {
  const provider = new SearxngProvider({
    baseUrl: 'http://127.0.0.1:8888/',
    fetch: async () => Response.json({
      results: [
        { title: '有效', url: 'https://example.edu/a', content: '线索', engines: ['bing'] },
        { title: '重复', url: 'https://example.edu/a', content: '重复线索', engines: ['bing'] },
        { title: '', url: 'https://example.edu/b', content: '空标题' },
        { title: '空地址', url: '', content: '空地址' },
        { title: '文件', url: 'file:///C:/secret.txt', content: '本地文件' },
        { title: '本机', url: 'http://localhost:3210/admin', content: '本机' },
        { title: '回环', url: 'http://127.0.0.1/private', content: '回环' },
        { title: '内网 A', url: 'http://10.0.0.2/a', content: '内网' },
        { title: '内网 B', url: 'http://172.16.0.2/a', content: '内网' },
        { title: '内网 C', url: 'http://192.168.1.2/a', content: '内网' },
        { title: '凭据', url: 'https://user:pass@example.edu/a', content: '凭据' },
      ],
    }),
  });

  const result = await provider.search('测试');
  assert.equal(result.status, 'available');
  assert.deepEqual(result.leads.map((lead) => lead.title), ['有效']);
});

test('SearXNG provider reports explicit unavailable states without throwing', async (t) => {
  const cases: Array<{
    name: string;
    fetch: typeof globalThis.fetch;
    expected: 'temporarily-unavailable' | 'configuration-error';
  }> = [
    {
      name: '429',
      fetch: async () => new Response('rate limited', { status: 429 }),
      expected: 'temporarily-unavailable',
    },
    {
      name: 'malformed json',
      fetch: async () => new Response('not-json', { status: 200 }),
      expected: 'temporarily-unavailable',
    },
    {
      name: 'timeout',
      fetch: async (_input, init) => {
        await new Promise<void>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
        throw new Error('unreachable');
      },
      expected: 'temporarily-unavailable',
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const provider = new SearxngProvider({
        baseUrl: 'http://127.0.0.1:8888',
        timeoutMs: item.name === 'timeout' ? 5 : 100,
        fetch: item.fetch,
      });
      assert.deepEqual(await provider.search('测试'), {
        status: item.expected,
        leads: [],
      });
      assert.equal(provider.status().lastSearchStatus, item.expected);
      assert.match(provider.status().lastSearchAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
    });
  }

  const unconfigured = new SearxngProvider({ baseUrl: '   ' });
  assert.deepEqual(await unconfigured.search('测试'), {
    status: 'configuration-error',
    leads: [],
  });
  assert.deepEqual(unconfigured.status(), {
    status: 'configuration-error',
    lastSearchStatus: 'configuration-error',
    lastSearchAt: null,
  });
});

test('SearXNG empty result is an honest available miss', async () => {
  const provider = new SearxngProvider({
    baseUrl: 'http://127.0.0.1:8888',
    fetch: async () => Response.json({ results: [] }),
  });
  assert.deepEqual(await provider.search('不存在的测试问题'), {
    status: 'available',
    leads: [],
  });
});
