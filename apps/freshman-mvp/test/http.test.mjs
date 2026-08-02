import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

import { createApp } from '../src/app.mjs';
import { JsonStore } from '../src/json-store.mjs';
import { ReviewRepository } from '../src/review-repository.mjs';
import { AnswerRouter } from '../src/answer-router.mjs';
import { DEFAULT_DISCLAIMER } from '../src/config.mjs';

async function startFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'hdu-http-'));
  const presets = new JsonStore(join(dir, 'presets.json'), {
    items: [{ id: 'p1', question: '怎么转专业', aliases: [], keywords: ['转专业'], answer: '预设回答', source: { title: '预设' } }],
  });
  const knowledge = new JsonStore(join(dir, 'knowledge.json'), { items: [] });
  const reviewStore = new JsonStore(join(dir, 'reviews.json'), { nextOrdinal: 1, items: [] });
  const reviews = new ReviewRepository(reviewStore, knowledge);
  const router = new AnswerRouter({
    config: { presetThreshold: 0.45, knowledgeThreshold: 0.5, disclaimer: DEFAULT_DISCLAIMER },
    presetStore: presets,
    knowledgeStore: knowledge,
    reviews,
    provider: { async answer(q) { return { text: `回答${q}`, sources: [], mode: 'demo' }; } },
  });
  const server = createServer(createApp({ router, reviews, publicDir: join(dir, 'public'), demoMode: true }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('health and validation responses are JSON', async () => {
  const app = await startFixture();
  try {
    const health = await fetch(`${app.base}/api/health`).then((r) => r.json());
    assert.deepEqual(health, { ok: true, mode: 'demo' });
    const invalid = await fetch(`${app.base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: '' }),
    });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /question/);
  } finally {
    await app.close();
  }
});

test('ask, FIFO review list and decision APIs complete the workflow', async () => {
  const app = await startFixture();
  try {
    const preset = await fetch(`${app.base}/api/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: '怎么转专业' }),
    }).then((r) => r.json());
    assert.equal(preset.route, 'preset');

    const web = await fetch(`${app.base}/api/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: '一个新问题' }),
    }).then((r) => r.json());
    assert.equal(web.route, 'web');
    assert.equal(web.disclaimer, DEFAULT_DISCLAIMER);

    const list = await fetch(`${app.base}/api/reviews?status=pending`).then((r) => r.json());
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].statusLabel, '待审核');

    const response = await fetch(`${app.base}/api/reviews/${list.items[0].id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'approved', finalAnswer: '人工答案' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).item.status, 'approved');
  } finally {
    await app.close();
  }
});

test('unknown API route returns 404 without exposing filesystem paths', async () => {
  const app = await startFixture();
  try {
    const response = await fetch(`${app.base}/api/unknown`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'not found');
  } finally {
    await app.close();
  }
});

test('browser favicon probe does not create a console 404', async () => {
  const app = await startFixture();
  try {
    const response = await fetch(`${app.base}/favicon.ico`);
    assert.equal(response.status, 204);
  } finally {
    await app.close();
  }
});
