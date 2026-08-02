import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

import { JsonStore } from '../src/json-store.mjs';
import { ReviewRepository } from '../src/review-repository.mjs';
import { AnswerRouter } from '../src/answer-router.mjs';
import { createApp } from '../src/app.mjs';
import { DEFAULT_DISCLAIMER } from '../src/config.mjs';

const appRoot = join(import.meta.dirname, '..');

async function seed(filename) {
  return JSON.parse(await readFile(join(appRoot, 'data', filename), 'utf8'));
}

test('seed data and restarted store complete all three routes', async () => {
  const presetSeed = await seed('presets.json');
  const knowledgeSeed = await seed('knowledge.json');
  const runtimeReviews = await seed('reviews.json');
  const reviewSeed = { nextOrdinal: 1, items: [] };
  assert.ok(presetSeed.items.length >= 8);
  assert.ok(knowledgeSeed.items.length >= 4);
  assert.ok(Number.isInteger(runtimeReviews.nextOrdinal));
  assert.ok(Array.isArray(runtimeReviews.items));

  const dir = await mkdtemp(join(tmpdir(), 'hdu-smoke-'));
  const presets = new JsonStore(join(dir, 'presets.json'), presetSeed);
  const knowledge = new JsonStore(join(dir, 'knowledge.json'), knowledgeSeed);
  const reviewPath = join(dir, 'reviews.json');
  const reviews = new ReviewRepository(new JsonStore(reviewPath, reviewSeed), knowledge);
  const router = new AnswerRouter({
    config: { presetThreshold: 0.52, knowledgeThreshold: 0.38, intentConfidence: 0.78, disclaimer: DEFAULT_DISCLAIMER },
    presetStore: presets,
    knowledgeStore: knowledge,
    reviews,
    provider: { async answer(question) { return { text: `演示：${question}`, sources: [], mode: 'demo' }; } },
  });
  const server = createServer(createApp({ router, reviews, publicDir: join(appRoot, 'public'), demoMode: true }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ask = async (question) => fetch(`${base}/api/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }),
    }).then((response) => response.json());
    assert.equal((await ask('怎么申请转专业')).route, 'collecting');
    assert.equal((await ask('校园卡丢了怎么办')).route, 'knowledge');
    assert.equal((await ask('学校附近哪里修自行车')).route, 'web');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const restarted = new ReviewRepository(new JsonStore(reviewPath, reviewSeed), knowledge);
  const queue = await restarted.list({ status: 'pending' });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].displayLabel, '第一个未收录');
});
