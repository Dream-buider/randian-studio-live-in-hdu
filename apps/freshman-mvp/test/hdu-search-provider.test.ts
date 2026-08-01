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
    assert.deepEqual(result.leads.map(({ title, url, snippet }) => ({ title, url, snippet })), [
      {
        title: '杭州电子科技大学2025年学生社团科技文化节举行',
        url: 'https://www.hdu.edu.cn/news/2025/0610/c7517a279705/page.htm',
        snippet: '学校官方报道展示了学生科技类社团的创新活动；活动旨在促进科技创新、普及科学知识并培养跨学科合作精神。具体社团与活动安排以校方最新通知为准。',
      },
      {
        title: '杭州电子科技大学校团委',
        url: 'https://tuanwei.hdu.edu.cn/',
        snippet: '杭州电子科技大学校团委官方网站，设有校园活动、科技创新、通知公告和资料下载等栏目；具体社团信息请以网站可见的最新通知为准。',
      },
      {
        title: '杭州电子科技大学信息公开 · 学生管理服务信息',
        url: 'https://xxgk.hdu.edu.cn/8797/list.htm',
        snippet: '学校信息公开栏目包含学生社团管理制度入口；具体规定以页面可见的最新文件为准。',
      },
    ]);
  }
});

test('HDU-first search does not inject club evidence into an unrelated empty search', async () => {
  const provider = new HduFirstSearchProvider(sequencedProvider([
    { status: 'available', leads: [] },
    { status: 'available', leads: [] },
  ]));

  assert.deepEqual(await provider.search('食堂几点关门'), {
    status: 'available',
    leads: [],
  });
});
