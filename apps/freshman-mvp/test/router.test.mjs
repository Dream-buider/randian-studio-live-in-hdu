import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_DISCLAIMER } from '../src/config.mjs';
import { JsonStore } from '../src/json-store.mjs';
import { ReviewRepository, ordinalLabel } from '../src/review-repository.mjs';
import { AnswerRouter } from '../src/answer-router.mjs';
import { DeepSeekProvider } from '../src/providers.mjs';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'hdu-router-'));
  const presetStore = new JsonStore(join(dir, 'presets.json'), {
    items: [{
      id: 'p-major',
      question: '如何申请转专业',
      aliases: ['怎么转专业'],
      keywords: ['转专业', '申请'],
      answerStatus: 'approved',
      answer: '这是预设答案。',
      source: { title: '40 个预设问题', url: '' },
    }],
  });
  const knowledgeStore = new JsonStore(join(dir, 'knowledge.json'), {
    items: [{
      id: 'k-library',
      question: '图书馆开放时间',
      aliases: ['图书馆几点开门'],
      keywords: ['图书馆', '开放时间'],
      answer: '开放时间以图书馆当天公告为准。',
      source: { title: 'LIVE IN HDU 图书馆指南', url: 'https://example.test/library' },
    }],
  });
  const reviewStore = new JsonStore(join(dir, 'reviews.json'), { nextOrdinal: 1, items: [] });
  const reviews = new ReviewRepository(reviewStore, knowledgeStore);
  const provider = {
    async answer(question) {
      return {
        text: `联网演示答案：${question}`,
        sources: [{ title: '联网线索', url: 'https://example.test/web' }],
        mode: 'demo',
      };
    },
  };
  const config = {
    presetThreshold: 0.45,
    knowledgeThreshold: 0.42,
    intentConfidence: 0.78,
    disclaimer: DEFAULT_DISCLAIMER,
  };
  return {
    reviews,
    knowledgeStore,
    router: new AnswerRouter({ config, presetStore, knowledgeStore, reviews, provider }),
  };
}

test('router returns preset before knowledge or web', async () => {
  const { router, reviews } = await fixture();
  const result = await router.answer('我想问怎么转专业');
  assert.equal(result.route, 'preset');
  assert.equal(result.answer, '这是预设答案。');
  assert.equal((await reviews.list()).length, 0);
});

test('approved intent supports the collection workflow sources array', async () => {
  const { router } = await fixture();
  await router.presetStore.update((state) => {
    delete state.items[0].source;
    state.items[0].sources = [{ title: '团队审核稿', url: 'https://example.test/team' }];
  });
  const result = await router.answer('怎么转专业');
  assert.equal(result.sources[0].title, '团队审核稿');
  assert.equal(result.sources[0].type, 'preset');
});

test('router returns local knowledge with source', async () => {
  const { router } = await fixture();
  const result = await router.answer('图书馆几点开门');
  assert.equal(result.route, 'knowledge');
  assert.equal(result.sources[0].title, 'LIVE IN HDU 图书馆指南');
});

test('recognized intent with an answer under collection never returns a blank or stale answer', async () => {
  const { router } = await fixture();
  await router.presetStore.update((state) => {
    state.items[0].answerStatus = 'collecting';
    state.items[0].answer = '';
  });

  const result = await router.answer('我想问怎么转专业');
  assert.equal(result.route, 'collecting');
  assert.equal(result.intentId, 'p-major');
  assert.match(result.answer, /征集|审核/);
  assert.ok(result.answer.length > 10);
});

test('LLM intent classification maps a nonliteral paraphrase to an approved preset', async () => {
  const { router } = await fixture();
  router.provider.classifyIntent = async () => ({
    intentId: 'p-major',
    confidence: 0.94,
    reason: '用户询问更换就读专业',
  });

  const result = await router.answer('入学以后发现方向不合适，能不能换一条培养路线？');
  assert.equal(result.route, 'preset');
  assert.equal(result.intentId, 'p-major');
  assert.equal(result.matchMode, 'llm');
});

test('low-confidence LLM classification does not hijack knowledge or web fallback', async () => {
  const { router } = await fixture();
  router.provider.classifyIntent = async () => ({ intentId: 'p-major', confidence: 0.41, reason: '不确定' });
  const result = await router.answer('学校附近哪里可以修自行车');
  assert.equal(result.route, 'web');
});

test('web route always answers, adds exact disclaimer and persists pending review', async () => {
  const { router, reviews } = await fixture();
  const result = await router.answer('学校附近哪里可以修自行车');
  assert.equal(result.route, 'web');
  assert.match(result.answer, /修自行车/);
  assert.equal(result.disclaimer, DEFAULT_DISCLAIMER);
  assert.equal(result.reviewOrdinal, 1);

  const pending = await reviews.list({ status: 'pending' });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].statusLabel, '待审核');
  assert.equal(pending[0].displayLabel, '第一个未收录');
});

test('review queue remains FIFO and approval writes the final answer into knowledge', async () => {
  const { router, reviews, knowledgeStore } = await fixture();
  await router.answer('第一个全新问题');
  await router.answer('第二个全新问题');
  const pending = await reviews.list({ status: 'pending' });
  assert.deepEqual(pending.map((item) => item.ordinal), [1, 2]);

  const approved = await reviews.decide(pending[0].id, {
    status: 'approved',
    finalAnswer: '经过人工核实的答案。',
    reviewerId: 'local-admin',
  });
  assert.equal(approved.statusLabel, '已通过');
  assert.equal((await knowledgeStore.read()).items.at(-1).answer, '经过人工核实的答案。');
});

test('ordinalLabel supports stable Chinese labels without hard-coded queue counts', () => {
  assert.equal(ordinalLabel(1), '第一个未收录');
  assert.equal(ordinalLabel(2), '第二个未收录');
  assert.equal(ordinalLabel(11), '第十一个未收录');
  assert.equal(ordinalLabel(105), '第105个未收录');
});

test('DeepSeekProvider uses the current V4 model and never leaks the API key', async () => {
  let captured;
  const provider = new DeepSeekProvider({
    config: {
      demoMode: false,
      deepseekApiKey: 'super-secret',
      deepseekBaseUrl: 'https://api.deepseek.com',
      deepseekModel: 'deepseek-v4-flash',
      requestTimeoutMs: 1_000,
      webSearchEndpoint: '',
      webSearchApiKey: '',
    },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: '真实模型答案' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await provider.answer('问题');
  assert.equal(result.text, '真实模型答案');
  assert.equal(JSON.parse(captured.options.body).model, 'deepseek-v4-flash');
  assert.equal(captured.options.headers.Authorization, 'Bearer super-secret');
  assert.doesNotMatch(JSON.stringify(result), /super-secret/);
});

test('DeepSeekProvider classifies only into the supplied intent IDs using JSON output', async () => {
  let captured;
  const provider = new DeepSeekProvider({
    config: {
      demoMode: false,
      deepseekApiKey: 'super-secret',
      deepseekBaseUrl: 'https://api.deepseek.com',
      deepseekModel: 'deepseek-v4-flash',
      requestTimeoutMs: 1_000,
    },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"intentId":"campus-card-issue","confidence":0.93,"reason":"询问办卡地点"}' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const intents = [{
    id: 'campus-card-issue',
    question: '校园卡如何领取、激活、充值和使用',
    intentDescription: '识别新生首次办理、领取校园卡以及激活充值和基础使用方式的问题。',
    aliases: ['学校怎么办校园卡'],
  }];

  const result = await provider.classifyIntent('学校的饭卡到底在哪儿弄？', intents);
  const body = JSON.parse(captured.options.body);
  assert.deepEqual(result, { intentId: 'campus-card-issue', confidence: 0.93, reason: '询问办卡地点' });
  assert.equal(body.model, 'deepseek-v4-flash');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.match(body.messages[0].content, /campus-card-issue/);
  assert.doesNotMatch(JSON.stringify(result), /super-secret/);
});

test('DeepSeekProvider intent classification fails open in demo mode or for an unknown ID', async () => {
  let calls = 0;
  const demoProvider = new DeepSeekProvider({
    config: { demoMode: true },
    fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); },
  });
  assert.equal(await demoProvider.classifyIntent('随便问', []), null);
  assert.equal(calls, 0);

  const liveProvider = new DeepSeekProvider({
    config: {
      demoMode: false,
      deepseekApiKey: 'secret',
      deepseekBaseUrl: 'https://api.deepseek.com',
      deepseekModel: 'deepseek-v4-flash',
      requestTimeoutMs: 1_000,
    },
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"intentId":"invented-id","confidence":0.99,"reason":"bad"}' } }],
    }), { status: 200 }),
  });
  assert.equal(await liveProvider.classifyIntent('随便问', [{ id: 'known-id', question: '已知问题' }]), null);
});
