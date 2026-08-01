import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  SearchLead,
  SearchProvider,
  WebSearchResult,
} from '../src/providers/contracts.js';
import {
  HduFirstSearchProvider,
  isHduOfficialUrl,
  sourceFromSearchLead,
} from '../src/providers/hdu-search-provider.js';

function lead(title: string, url: string): SearchLead {
  return {
    title,
    url,
    snippet: `${title}摘要`,
    engines: ['test'],
    retrievedAt: '2026-08-02T00:00:00.000Z',
  };
}

function sequencedProvider(
  responses: Array<WebSearchResult | Error>,
  receivedQueries: string[] = [],
): SearchProvider {
  return {
    async search(question) {
      receivedQueries.push(question);
      const response = responses.shift();
      if (response instanceof Error) {
        throw response;
      }
      assert.ok(response, 'unexpected search call');
      return response;
    },
  };
}

test('HDU-first search uses both queries and ranks official, approved guide, then public web leads', async () => {
  const receivedQueries: string[] = [];
  const provider = new HduFirstSearchProvider(sequencedProvider([
    {
      status: 'available',
      leads: [
        lead('其他高校社团介绍', 'https://other.edu.cn/clubs'),
        lead('杭电学生社团科技文化节', 'https://www.hdu.edu.cn/news/clubs'),
      ],
    },
    {
      status: 'available',
      leads: [lead('社区社团经验', 'https://rcncolp2ehkb.feishu.cn/wiki/club-guide')],
    },
  ], receivedQueries));

  const result = await provider.search('社团有什么作用吗');

  assert.deepEqual(receivedQueries, [
    'site:hdu.edu.cn 社团有什么作用吗',
    '杭州电子科技大学 社团有什么作用吗',
  ]);
  assert.deepEqual(result.leads.map((item) => item.title), [
    '杭电学生社团科技文化节',
    '社区社团经验',
    '其他高校社团介绍',
  ]);
  assert.equal(result.status, 'available');
});

test('HDU URL classification uses parsed hostname boundaries and maps search leads to sources', () => {
  assert.equal(isHduOfficialUrl('https://www.hdu.edu.cn/news/a'), true);
  assert.equal(isHduOfficialUrl('https://hdu.edu.cn/news/a'), true);
  assert.equal(isHduOfficialUrl('https://evil-hdu.edu.cn/a'), false);
  assert.equal(isHduOfficialUrl('not a url'), false);
  assert.deepEqual(
    sourceFromSearchLead(lead(' 学校通知 ', 'https://news.hdu.edu.cn/a')),
    {
      type: 'official',
      title: '学校通知',
      url: 'https://news.hdu.edu.cn/a',
      updatedAt: null,
    },
  );
  assert.equal(
    sourceFromSearchLead(lead('社区指南', 'https://rcncolp2ehkb.feishu.cn/wiki/a')).type,
    'web',
  );
});

test('HDU-first search keeps a successful query when the other query throws', async () => {
  const provider = new HduFirstSearchProvider(sequencedProvider([
    new Error('official query failed'),
    {
      status: 'available',
      leads: [lead('社区线索', 'https://example.edu/community')],
    },
  ]));

  assert.deepEqual(await provider.search('住宿如何安排'), {
    status: 'available',
    leads: [lead('社区线索', 'https://example.edu/community')],
  });
});

test('HDU-first search deduplicates exact URLs while preserving the first lead', async () => {
  const provider = new HduFirstSearchProvider(sequencedProvider([
    {
      status: 'available',
      leads: [lead('第一次出现', 'https://www.hdu.edu.cn/same')],
    },
    {
      status: 'available',
      leads: [lead('第二次出现', 'https://www.hdu.edu.cn/same')],
    },
  ]));

  const result = await provider.search('重复线索');
  assert.deepEqual(result.leads.map((item) => item.title), ['第一次出现']);
});

test('HDU-first search caps merged results at six', async () => {
  const provider = new HduFirstSearchProvider(sequencedProvider([
    {
      status: 'available',
      leads: Array.from({ length: 4 }, (_, index) => (
        lead(`第一批 ${index}`, `https://www.hdu.edu.cn/${index}`)
      )),
    },
    {
      status: 'available',
      leads: Array.from({ length: 4 }, (_, index) => (
        lead(`第二批 ${index}`, `https://example.edu/${index}`)
      )),
    },
  ]), 99);

  const result = await provider.search('数量上限');
  assert.equal(result.leads.length, 6);
  assert.deepEqual(result.leads.map((item) => item.title), [
    '第一批 0',
    '第一批 1',
    '第一批 2',
    '第一批 3',
    '第二批 0',
    '第二批 1',
  ]);
});

test('HDU-first search preserves an explicit status when both queries fail', async () => {
  const provider = new HduFirstSearchProvider(sequencedProvider([
    { status: 'configuration-error', leads: [] },
    { status: 'temporarily-unavailable', leads: [] },
  ]));

  assert.deepEqual(await provider.search('完全失败'), {
    status: 'configuration-error',
    leads: [],
  });
});

test('HDU-first search supplies verified official club evidence when live search returns no leads', async () => {
  for (const question of ['给个社团的建议', '社团有什么作用吗']) {
    const provider = new HduFirstSearchProvider(sequencedProvider([
      { status: 'available', leads: [] },
      { status: 'available', leads: [] },
    ]));

    const result = await provider.search(question);

    assert.equal(result.status, 'available');
    assert.deepEqual(result.leads.map((item) => item.url), [
      'https://www.hdu.edu.cn/news/2025/0610/c7517a279705/page.htm',
      'https://tuanwei.hdu.edu.cn/',
      'https://xxgk.hdu.edu.cn/8797/list.htm',
    ]);
    assert.ok(result.leads.every((item) => item.title.trim().length > 0));
    assert.ok(result.leads.every((item) => item.snippet.trim().length > 0));
  }
});
