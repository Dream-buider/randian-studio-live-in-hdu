import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { QuestionIntent, SourceRef } from '../src/domain/models.js';
import {
  createProductionRuntime,
  type ProductionRuntime,
} from '../src/server/index.js';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME';
const TEST_TEMP = path.join(DATA_ROOT, 'temp');
const DISCLAIMER = '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别';

const SOURCES: SourceRef[] = [{
  type: 'community',
  title: '测试审核来源',
  url: '',
  updatedAt: '2026-07-28',
}];

const INTENT: QuestionIntent = {
  id: 'campus-card-e2e',
  externalId: 'Q01',
  category: '校园生活',
  question: '校园一卡通如何领取？',
  intentDescription: '新生首次领取和激活校园卡',
  aliases: ['学校怎么办校园卡'],
  keywords: ['校园卡', '一卡通'],
  excludeKeywords: ['挂失'],
  active: true,
  featured: true,
  displayOrder: 1,
};

async function closeQuietly(runtime: ProductionRuntime | null): Promise<void> {
  if (runtime) {
    await runtime.close();
  }
}

test('full local flow reports honest health, serves SPA routes, and persists review FIFO after restart', async () => {
  const directory = await mkdtemp(path.join(TEST_TEMP, 'live-in-hdu-e2e-'));
  const databasePath = path.join(directory, 'full-flow.db');
  const env = {
    HOST: '127.0.0.1',
    PORT: '3210',
    DATABASE_PATH: databasePath,
    TOKENDANCE_API_KEY: '   ',
  };
  let runtime: ProductionRuntime | null = null;

  try {
    runtime = await createProductionRuntime({ appRoot: APP_ROOT, env });
    await runtime.content.createIntent(INTENT);
    await runtime.content.publishCanonicalAnswer({
      intentId: INTENT.id,
      summary: '校园卡通常会按学院通知统一领取，到校后请及时激活并修改密码。',
      fullAnswer: '校园卡通常会按学院通知统一领取，到校后请及时激活并修改密码；具体地点以当年通知为准。',
      sources: SOURCES,
      reviewerId: 'e2e-reviewer',
    });

    const health = await runtime.app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), {
      status: 'ok',
      components: {
        gateway: { status: 'healthy' },
        businessDatabase: { status: 'healthy', mode: 'sqlite' },
        database: { status: 'ok', mode: 'sqlite' },
        model: { status: 'disabled', mode: 'no-key' },
        tokenDance: {
          status: 'disabled',
          lastCallStatus: 'never',
          lastCallAt: null,
        },
        knowledge: { status: 'ok', mode: 'local-json' },
        weknora: { status: 'not-configured' },
        embedding: { status: 'not-configured', mode: 'ollama' },
        search: {
          status: 'unavailable',
          mode: 'phase-a-disabled',
          lastSearchStatus: 'never',
          lastSearchAt: null,
        },
        reviewQueue: { status: 'ok', pending: 0 },
        integrationOutbox: {
          status: 'not-configured',
          pending: 0,
          failed: 0,
        },
      },
    });
    assert.doesNotMatch(health.body, /api[_-]?key|test-key|tokendance_api_key/i);

    const questions = await runtime.app.inject({ method: 'GET', url: '/api/questions' });
    assert.equal(questions.statusCode, 200);
    assert.deepEqual(
      questions.json().items.map((item: { id: string }) => item.id),
      [INTENT.id],
    );

    const preset = await runtime.app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: { question: '学校怎么办校园卡' },
    });
    assert.equal(preset.statusCode, 200);
    assert.equal(preset.json().route, 'preset');

    const knowledge = await runtime.app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: { question: '图书馆几点关门' },
    });
    assert.equal(knowledge.statusCode, 200);
    assert.equal(knowledge.json().route, 'knowledge');
    assert.match(knowledge.json().answer, /开放时间/);

    const unknown = await runtime.app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: { question: '校内哪里可以修理天文望远镜？' },
    });
    assert.equal(unknown.statusCode, 200);
    assert.equal(unknown.json().route, 'web');
    assert.equal(unknown.json().disclaimer, DISCLAIMER);
    assert.match(unknown.json().answer, /学校官网|官方/);
    assert.equal(unknown.json().reviewOrdinal, 1);

    for (const { method, url } of [
      { method: 'GET', url: '/' },
      { method: 'GET', url: '/questions' },
      { method: 'HEAD', url: '/questions' },
      { method: 'GET', url: '/chat' },
      { method: 'GET', url: '/admin' },
      { method: 'GET', url: '/guide' },
      { method: 'HEAD', url: '/guide' },
      { method: 'GET', url: '/guide?source=homepage' },
    ] as const) {
      const page = await runtime.app.inject({ method, url });
      assert.equal(page.statusCode, 200, `${method} ${url}`);
      assert.match(page.headers['content-type'] ?? '', /text\/html/);
      if (method === 'GET') {
        assert.match(page.body, /id="app"/);
      } else {
        assert.equal(page.body, '');
      }
    }
    for (const url of ['/guide/admin', '/not-a-spa-route']) {
      const page = await runtime.app.inject({ method: 'GET', url });
      assert.equal(page.statusCode, 404, url);
      assert.deepEqual(page.json(), {
        error: { code: 'NOT_FOUND', message: 'Route not found' },
      });
    }

    await runtime.close();
    runtime = null;
    runtime = await createProductionRuntime({ appRoot: APP_ROOT, env });

    const restartedQuestions = await runtime.app.inject({
      method: 'GET',
      url: '/api/questions',
    });
    assert.deepEqual(
      restartedQuestions.json().items.map((item: { id: string }) => item.id),
      [INTENT.id],
    );
    const pending = await runtime.app.inject({
      method: 'GET',
      url: '/api/reviews?status=pending',
    });
    assert.equal(pending.statusCode, 200);
    assert.deepEqual(
      pending.json().items.map((item: { ordinal: number; question: string }) => ({
        ordinal: item.ordinal,
        question: item.question,
      })),
      [{ ordinal: 1, question: '校内哪里可以修理天文望远镜？' }],
    );
  } finally {
    await closeQuietly(runtime);
    await rm(directory, { recursive: true, force: true });
  }
});

test('production composition uses TokenDance only for a trimmed real key and accepts injected fetch', async () => {
  const directory = await mkdtemp(path.join(TEST_TEMP, 'live-in-hdu-live-model-'));
  const databasePath = path.join(directory, 'model.db');
  const calls: Array<{ input: string; authorization: string; model: string }> = [];
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { model?: string };
    calls.push({
      input: String(input),
      authorization: String((init?.headers as Record<string, string>).Authorization),
      model: String(body.model),
    });
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: '{"intentId":"campus-card-e2e","confidence":0.96,"reason":"同义问题"}',
        },
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  let runtime: ProductionRuntime | null = null;

  try {
    runtime = await createProductionRuntime({
      appRoot: APP_ROOT,
      env: {
        DATABASE_PATH: databasePath,
        TOKENDANCE_API_KEY: '  test-key  ',
      },
      fetch: fakeFetch,
    });
    await runtime.content.createIntent(INTENT);
    await runtime.content.publishCanonicalAnswer({
      intentId: INTENT.id,
      summary: '校园卡通常会按学院通知统一领取，到校后请及时激活并修改密码。',
      fullAnswer: '校园卡通常会按学院通知统一领取，到校后请及时激活并修改密码；具体地点以当年通知为准。',
      sources: SOURCES,
      reviewerId: 'e2e-reviewer',
    });

    const response = await runtime.app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: { question: '入学后领取饭卡要走什么流程？' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().route, 'preset');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, 'https://tokendance.space/gateway/v1/chat/completions');
    assert.equal(calls[0].authorization, 'Bearer test-key');
    assert.equal(calls[0].model, 'deepseek-v4-flash');

    const health = await runtime.app.inject({ method: 'GET', url: '/api/health' });
    assert.deepEqual(health.json().components.model, {
      status: 'configured',
      mode: 'tokendance',
    });
    assert.equal(health.json().components.tokenDance.status, 'configured');
    assert.equal(health.json().components.tokenDance.lastCallStatus, 'ok');
    assert.match(
      health.json().components.tokenDance.lastCallAt,
      /^\d{4}-\d{2}-\d{2}T/,
    );
    assert.doesNotMatch(health.body, /test-key/);
  } finally {
    await closeQuietly(runtime);
    await rm(directory, { recursive: true, force: true });
  }
});

test('WeKnora missing configuration does not block preset answers or the local admin console', async () => {
  const directory = await mkdtemp(path.join(TEST_TEMP, 'live-in-hdu-weknora-missing-'));
  const databasePath = path.join(directory, 'weknora-missing.db');
  let fetchCalls = 0;
  let runtime: ProductionRuntime | null = null;
  try {
    runtime = await createProductionRuntime({
      appRoot: APP_ROOT,
      env: {
        HOST: '127.0.0.1',
        DATABASE_PATH: databasePath,
        KNOWLEDGE_PROVIDER: 'weknora',
        WEKNORA_BASE_URL: 'http://127.0.0.1:8080/api/v1',
        WEKNORA_API_KEY: '',
        WEKNORA_DOCUMENT_KB_ID: '',
        WEKNORA_FAQ_KB_ID: '',
      },
      fetch: async () => {
        fetchCalls += 1;
        throw new Error('missing configuration must not call WeKnora');
      },
    });
    await runtime.content.createIntent(INTENT);
    await runtime.content.publishCanonicalAnswer({
      intentId: INTENT.id,
      summary: '校园卡通常会按学院通知统一领取，到校后请及时激活并修改密码。',
      fullAnswer: '校园卡通常会按学院通知统一领取，到校后请及时激活并修改密码；具体地点以当年通知为准。',
      sources: SOURCES,
      reviewerId: 'e2e-reviewer',
    });
    const preset = await runtime.app.inject({
      method: 'POST',
      url: '/api/ask',
      payload: { question: '学校怎么办校园卡' },
    });
    assert.equal(preset.statusCode, 200);
    assert.equal(preset.json().route, 'preset');
    const admin = await runtime.app.inject({ method: 'GET', url: '/api/admin/intents' });
    assert.equal(admin.statusCode, 200);
    const health = await runtime.app.inject({ method: 'GET', url: '/api/health' });
    assert.deepEqual(health.json().components.knowledge, {
      status: 'not-configured',
      mode: 'weknora',
    });
    assert.equal(fetchCalls, 0);
  } finally {
    await closeQuietly(runtime);
    await rm(directory, { recursive: true, force: true });
  }
});

test('production runtime refuses a missing C runtime junction without creating a C directory', async () => {
  const appRoot = path.join(
    APP_ROOT,
    `.runtime-guard-${process.pid}-${Date.now()}`,
  );
  const runtimeDirectory = path.join(appRoot, 'runtime');
  await mkdir(appRoot, { recursive: true });
  try {
    await assert.rejects(
      createProductionRuntime({
        appRoot,
        env: {
          HOST: '127.0.0.1',
          PORT: '3210',
          TOKENDANCE_API_KEY: '',
        },
      }),
      /D:|junction|runtime/i,
    );
    await assert.rejects(stat(runtimeDirectory), { code: 'ENOENT' });
  } finally {
    await rm(appRoot, { recursive: true, force: true });
  }
});

test('production runtime permits a local SQLite path on Linux hosts', async () => {
  const directory = path.join(
    APP_ROOT,
    `.linux-runtime-${process.pid}-${Date.now()}`,
  );
  const databasePath = path.join(directory, 'live-in-hdu.db');
  const options = {
    appRoot: APP_ROOT,
    env: {
      HOST: '127.0.0.1',
      PORT: '3210',
      DATABASE_PATH: databasePath,
      TOKENDANCE_API_KEY: '',
    },
    runtimePlatform: 'linux' as const,
  };
  let runtime: ProductionRuntime | null = null;

  try {
    runtime = await createProductionRuntime(options);
    const database = await stat(databasePath);
    assert.equal(database.isFile(), true);
  } finally {
    await closeQuietly(runtime);
    await rm(directory, { recursive: true, force: true });
  }
});
