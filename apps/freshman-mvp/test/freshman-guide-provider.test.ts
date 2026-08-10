import assert from 'node:assert/strict';
import test from 'node:test';
import type { FreshmanGuideChunk } from '../src/content/freshman-guide-document.js';
import { FreshmanGuideProvider } from '../src/providers/freshman-guide-provider.js';

function chunk(
  id: string,
  displayTitle: string,
  content: string,
  sequence: number,
): FreshmanGuideChunk {
  return {
    id,
    titlePath: ['开学准备篇', displayTitle],
    displayTitle,
    content,
    sectionId: 'preparation',
    sequence,
    source: {
      type: 'community',
      title: `杭电新生指北 · ${displayTitle}`,
      url: `https://example.test/${id}`,
      updatedAt: '2026-07-30',
    },
  };
}

const guideChunks = [
  chunk('student-id', '学号班级号获取', '在智慧杭电中查询自己的学号和班级号。', 0),
  chunk('dingtalk', '钉钉杭州电子科技大学认证', '在航电钉完成注册和学校认证后查看通知。', 1),
  chunk('dorm-type', '宿舍类型', '寝室通常需要确认宿舍大小和几人间。', 2),
  chunk('aid', '助学政策', '国家助学金申请以学校当年通知为准。', 3),
] as const;

test('guide aliases retrieve their intended chunks and map the knowledge hit fields', async () => {
  const provider = new FreshmanGuideProvider({ chunks: guideChunks });

  const dingtalk = await provider.search('航电钉怎么注册？');
  assert.equal(dingtalk.hits[0]?.chunkId, 'dingtalk');
  assert.deepEqual(dingtalk.hits[0] && {
    knowledgeId: dingtalk.hits[0].knowledgeId,
    title: dingtalk.hits[0].title,
    sourceType: dingtalk.hits[0].sourceType,
    source: dingtalk.hits[0].source,
  }, {
    knowledgeId: 'freshman-guide-2026',
    title: '杭电新生指北',
    sourceType: 'community',
    source: guideChunks[1].source,
  });

  assert.equal((await provider.search('学校钉钉怎么认证？')).hits[0]?.chunkId, 'dingtalk');
  assert.equal((await provider.search('寝室多大，是几人间？')).hits[0]?.chunkId, 'dorm-type');
});

test('guide aliases retrieve a real child heading through its canonical parent heading', async () => {
  const realGuideProvider = new FreshmanGuideProvider({
    chunks: [{
      id: 'real-dingtalk-platform',
      titlePath: [
        '入学指南篇',
        '1.3钉钉杭州电子科技大学认证',
        '什么是杭州电子科技大学钉钉平台？',
      ],
      displayTitle: '什么是杭州电子科技大学钉钉平台？',
      content: '这相当于加入钉钉中的杭电团队，并获得一个与个人学号对应的平台账号。',
      sectionId: 'preparation',
      sequence: 0,
      source: {
        type: 'community',
        title: '杭电新生指北 · 什么是杭州电子科技大学钉钉平台？',
        url: 'https://example.test/real-dingtalk-platform',
        updatedAt: '2026-07-30',
      },
    }],
  });

  const result = await realGuideProvider.search('航电钉怎么注册？');

  assert.equal(result.hits[0]?.chunkId, 'real-dingtalk-platform');
});

test('guide alias expansion does not turn an unrelated repair question into a hit', async () => {
  const provider = new FreshmanGuideProvider({ chunks: guideChunks });

  assert.deepEqual(await provider.search('校内哪里可以修理天文望远镜？'), {
    status: 'available',
    hits: [],
  });
});

test('a repeated weak token across guide fields does not turn unrelated intents into hits', async () => {
  const provider = new FreshmanGuideProvider({
    chunks: [
      {
        ...chunk(
          'parcel',
          '快递收发',
          '快递站支持收件和寄件，菜鸟驿站位于生活区北门外。',
          0,
        ),
        titlePath: ['生活篇', '生活区篇', '快递收发'],
      },
      {
        ...chunk(
          'stadium',
          '活力体育场',
          '体育场包括田径场、体育馆和篮球场等运动地点。',
          1,
        ),
        titlePath: ['生活篇', '教学区篇', '活力体育场'],
      },
    ],
  });

  assert.deepEqual((await provider.search('学校体育比赛怎么报名？')).hits, []);
  assert.deepEqual((await provider.search('快递员怎么应聘？')).hits, []);
});

test('approved guide terms and aliases still retrieve genuine parcel, stadium, dormitory, and DingTalk questions', async () => {
  const provider = new FreshmanGuideProvider({
    chunks: [
      {
        ...chunk('parcel', '快递收发', '快递站位于生活区北门外，可以收件和寄件。', 0),
        titlePath: ['生活篇', '生活区篇', '快递收发'],
      },
      {
        ...chunk('stadium', '活力体育场', '体育场包括田径场和体育馆。', 1),
        titlePath: ['生活篇', '教学区篇', '活力体育场'],
      },
      ...guideChunks,
    ],
  });

  assert.equal((await provider.search('学校快递在哪里取？')).hits[0]?.chunkId, 'parcel');
  assert.equal((await provider.search('体育场在哪里？')).hits[0]?.chunkId, 'stadium');
  assert.equal((await provider.search('寝室是几人间？')).hits[0]?.chunkId, 'dorm-type');
  assert.equal((await provider.search('航电钉如何认证？')).hits[0]?.chunkId, 'dingtalk');
});

test('controlled arrival-material aliases retrieve the canonical guide arrival chunk', async () => {
  const provider = new FreshmanGuideProvider({
    chunks: [
      {
        ...chunk('earlier-registration', '新生报到流程', '新生报到前需要准备相关材料。', 0),
        titlePath: ['开学准备篇', '新生报到流程'],
      },
      {
        ...chunk('arrival-materials', '杭电到达篇', '入学准备清单。', 1),
        titlePath: ['开学准备篇', '4.杭电到达篇'],
      },
    ],
  });

  for (const question of [
    '报到要带什么？',
    '新生报到要准备哪些材料',
    '去学校要带什么东西？',
  ]) {
    assert.equal((await provider.search(question)).hits[0]?.chunkId, 'arrival-materials');
  }
});

test('guide retrieval returns an available miss for a generic-only question', async () => {
  const provider = new FreshmanGuideProvider({ chunks: guideChunks });

  assert.deepEqual(await provider.search('学校怎么办？'), {
    status: 'available',
    hits: [],
  });
});

test('guide retrieval keeps a deterministic score-then-sequence ordering and caps hits at eight', async () => {
  const manyProvider = new FreshmanGuideProvider({
    chunks: Array.from({ length: 10 }, (_, sequence) => (
      chunk(`dorm-${sequence}`, `宿舍事项 ${sequence}`, '宿舍入住说明。', sequence)
    )),
  });

  const first = await manyProvider.search('宿舍');
  const second = await manyProvider.search('宿舍');

  assert.equal(first.hits.length, 8);
  assert.deepEqual(first.hits.map((hit) => hit.chunkId), [
    'dorm-0', 'dorm-1', 'dorm-2', 'dorm-3', 'dorm-4', 'dorm-5', 'dorm-6', 'dorm-7',
  ]);
  assert.deepEqual(second.hits, first.hits);
});

test('guide retrieval exposes an inert not-configured provider for no chunks', async () => {
  const provider = new FreshmanGuideProvider({ chunks: [] });

  assert.deepEqual(provider.status(), { status: 'not-configured', chunks: 0 });
  assert.deepEqual(await provider.search('宿舍'), { status: 'not-configured', hits: [] });
});
