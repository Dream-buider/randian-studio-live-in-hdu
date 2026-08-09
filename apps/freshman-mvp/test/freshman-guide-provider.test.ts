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
