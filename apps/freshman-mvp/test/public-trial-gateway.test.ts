import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PublicTrialConfig } from '../src/public-trial/config.js';
import { createPublicTrialApp } from '../src/public-trial/app.js';

const NOW = Date.parse('2026-08-01T00:00:00.000Z');
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-public-trial-'));
  const publicDir = path.join(directory, 'public');
  await mkdir(path.join(publicDir, 'assets'), { recursive: true });
  await mkdir(path.join(publicDir, 'brand'), { recursive: true });
  await writeFile(path.join(publicDir, 'index.html'), '<main>PUBLIC TRIAL APP</main>');
  await writeFile(path.join(publicDir, 'favicon.svg'), '<svg></svg>');
  await writeFile(path.join(publicDir, 'assets', 'app.js'), 'window.PUBLIC_TRIAL=true;');
  await writeFile(path.join(publicDir, 'brand', 'randian-studio-logo.png'), PNG_BYTES);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith('/api/questions')) {
      return Response.json({ items: [{ id: 'q01' }] });
    }
    return Response.json({
      route: 'preset',
      trustStatus: 'approved',
      answer: '校园卡回答',
      sources: [],
      intentId: 'q01',
    });
  };
  const config: PublicTrialConfig = {
    host: '127.0.0.1',
    port: 3211,
    upstreamOrigin: 'http://127.0.0.1:3210',
    publicDir,
    runtimeDir: 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\public-trial',
    accessCode: 'team-2026',
    sessionSecret: 's'.repeat(32),
    sessionTtlSeconds: 43_200,
    questionLimit: 30,
    questionWindowMs: 600_000,
    maxQuestionCodePoints: 500,
  };
  const app = createPublicTrialApp({
    config,
    fetch,
    now: () => NOW,
    randomUUID: () => 'session-1',
  });
  return {
    app,
    calls,
    cleanup: async () => {
      await app.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function guardedFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-public-trial-guarded-'));
  const publicDir = path.join(directory, 'public');
  await mkdir(path.join(publicDir, 'assets'), { recursive: true });
  await writeFile(path.join(publicDir, 'index.html'), '<main>PUBLIC TRIAL APP</main>');
  await writeFile(path.join(publicDir, 'favicon.svg'), '<svg></svg>');
  let currentTime = NOW;
  let sessionNumber = 0;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const logs: unknown[] = [];
  const config: PublicTrialConfig = {
    host: '127.0.0.1',
    port: 3211,
    upstreamOrigin: 'http://127.0.0.1:3210',
    publicDir,
    runtimeDir: 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\public-trial',
    accessCode: 'team-2026',
    sessionSecret: 's'.repeat(32),
    sessionTtlSeconds: 43_200,
    questionLimit: 30,
    questionWindowMs: 600_000,
    maxQuestionCodePoints: 500,
  };
  const app = createPublicTrialApp({
    config,
    now: () => currentTime,
    randomUUID: () => `session-${++sessionNumber}`,
    writeLog: (entry) => { logs.push(entry); },
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json({ answer: 'ok' });
    },
  });
  return {
    app,
    calls,
    logs,
    advance: (milliseconds: number) => { currentTime += milliseconds; },
    cleanup: async () => {
      await app.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function login(app: ReturnType<typeof createPublicTrialApp>): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/trial/login',
    payload: { code: 'team-2026' },
  });
  assert.equal(response.statusCode, 200);
  const setCookie = response.headers['set-cookie'];
  assert.equal(typeof setCookie, 'string');
  return String(setCookie).split(';', 1)[0];
}

test('public trial redirects users to a self-contained login page and rejects a wrong code', async () => {
  const { app, cleanup } = await fixture();
  try {
    const root = await app.inject({ method: 'GET', url: '/' });
    assert.equal(root.statusCode, 302);
    assert.equal(root.headers.location, '/trial/login');

    const page = await app.inject({ method: 'GET', url: '/trial/login' });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /LIVE IN HDU 团队内测/);
    assert.doesNotMatch(page.body, /https?:\/\/(?!127\.0\.0\.1)/);

    const wrong = await app.inject({
      method: 'POST',
      url: '/trial/login',
      payload: { code: 'wrong-code' },
    });
    assert.equal(wrong.statusCode, 401);
    assert.deepEqual(wrong.json(), {
      error: { code: 'INVALID_ACCESS_CODE', message: '测试码不正确' },
    });
  } finally {
    await cleanup();
  }
});

test('public trial issues a secure session and serves only the user frontend', async () => {
  const { app, cleanup } = await fixture();
  try {
    const cookie = await login(app);
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/trial/login',
      payload: { code: 'team-2026' },
    });
    assert.match(String(loginResponse.headers['set-cookie']), /HttpOnly.*Secure.*SameSite=Lax/);

    for (const { method, url } of [
      { method: 'GET', url: '/' },
      { method: 'GET', url: '/chat' },
      { method: 'GET', url: '/guide' },
      { method: 'HEAD', url: '/guide' },
      { method: 'GET', url: '/guide?next=/admin' },
    ] as const) {
      const response = await app.inject({ method, url, headers: { cookie } });
      assert.equal(response.statusCode, 200, `${method} ${url}`);
      if (method === 'GET') {
        assert.match(response.body, /PUBLIC TRIAL APP/);
      }
    }
    const asset = await app.inject({
      method: 'GET',
      url: '/assets/app.js',
      headers: { cookie },
    });
    assert.equal(asset.statusCode, 200);
    assert.equal(asset.body, 'window.PUBLIC_TRIAL=true;');

    for (const method of ['GET', 'HEAD'] as const) {
      const logo = await app.inject({
        method,
        url: '/brand/randian-studio-logo.png',
        headers: { cookie },
      });
      assert.equal(logo.statusCode, 200, `${method} logo`);
      assert.match(String(logo.headers['content-type']), /^image\/png(?:;|$)/u);
      if (method === 'GET') {
        assert.deepEqual(logo.rawPayload.subarray(0, 8), PNG_BYTES.subarray(0, 8));
      } else {
        assert.equal(logo.rawPayload.length, 0);
      }
    }

    const logout = await app.inject({
      method: 'POST',
      url: '/trial/logout',
      headers: { cookie },
    });
    assert.equal(logout.statusCode, 200);
    assert.match(String(logout.headers['set-cookie']), /Max-Age=0/);
  } finally {
    await cleanup();
  }
});

test('public trial proxies only public APIs with a restricted header set', async () => {
  const { app, calls, cleanup } = await fixture();
  try {
    const cookie = await login(app);
    const questions = await app.inject({
      method: 'GET',
      url: '/api/questions',
      headers: {
        cookie,
        authorization: 'Bearer must-not-forward',
        'x-forwarded-for': '127.0.0.1',
        accept: 'application/json',
      },
    });
    assert.equal(questions.statusCode, 200);
    assert.deepEqual(questions.json(), { items: [{ id: 'q01' }] });

    const answer = await app.inject({
      method: 'POST',
      url: '/api/ask',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { question: '学校怎么办校园卡' },
    });
    assert.equal(answer.statusCode, 200);
    assert.equal(answer.json().answer, '校园卡回答');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'http://127.0.0.1:3210/api/questions');
    const forwarded = new Headers(calls[0].init?.headers);
    assert.equal(forwarded.get('accept'), 'application/json');
    assert.equal(forwarded.has('authorization'), false);
    assert.equal(forwarded.has('cookie'), false);
    assert.equal(forwarded.has('x-forwarded-for'), false);
  } finally {
    await cleanup();
  }
});

test('public trial returns 404 for every management, health and unknown route without upstream calls', async () => {
  const { app, calls, cleanup } = await fixture();
  try {
    const cookie = await login(app);
    for (const url of [
      '/admin',
      '/api/admin/intents',
      '/api/reviews',
      '/api/reviews/one',
      '/api/health',
      '/guide/admin',
      '/unknown',
      '/assets/../index.html',
      '/brand/other.png',
      '/brand/randian-studio-logo.png/admin',
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie } });
      assert.equal(response.statusCode, 404, url);
      assert.deepEqual(response.json(), {
        error: { code: 'NOT_FOUND', message: 'Route not found' },
      });
    }
    assert.equal(calls.length, 0);
  } finally {
    await cleanup();
  }
});

test('public trial validates JSON questions by Unicode code point before proxying', async () => {
  const { app, calls, cleanup } = await guardedFixture();
  try {
    const cookie = await login(app);
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/ask',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        question: '问'.repeat(500),
        context: { intentId: 'q01', question: '校园卡', category: '入学准备' },
        requestId: 'request-1',
        ignored: 'must-not-forward',
      },
    });
    assert.equal(accepted.statusCode, 200);
    const forwarded = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    assert.equal(forwarded.question, '问'.repeat(500));
    assert.deepEqual(forwarded.context, {
      intentId: 'q01', question: '校园卡', category: '入学准备',
    });
    assert.equal(forwarded.requestId, 'request-1');
    assert.equal('ignored' in forwarded, false);

    const tooLong = await app.inject({
      method: 'POST',
      url: '/api/ask',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { question: '😀'.repeat(501) },
    });
    assert.equal(tooLong.statusCode, 400);

    const wrongType = await app.inject({
      method: 'POST',
      url: '/api/ask',
      headers: { cookie, 'content-type': 'text/plain' },
      payload: 'question=校园卡',
    });
    assert.equal(wrongType.statusCode, 415);
    assert.equal(calls.length, 1);
  } finally {
    await cleanup();
  }
});

test('public trial limits each signed session to 30 questions per ten minutes', async () => {
  const { app, calls, advance, cleanup } = await guardedFixture();
  try {
    const cookie = await login(app);
    const ask = () => app.inject({
      method: 'POST',
      url: '/api/ask',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { question: '校园卡怎么办' },
    });
    for (let index = 0; index < 30; index += 1) {
      assert.equal((await ask()).statusCode, 200, `request ${index + 1}`);
    }
    const limited = await ask();
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.headers['retry-after'], '600');
    assert.deepEqual(limited.json(), {
      error: { code: 'RATE_LIMITED', message: '测试请求较多，请稍后再试' },
    });
    assert.equal(calls.length, 30);

    advance(600_001);
    assert.equal((await ask()).statusCode, 200);
    assert.equal(calls.length, 31);
  } finally {
    await cleanup();
  }
});

test('public trial operational logs never contain codes, cookies, questions or authorization', async () => {
  const { app, logs, cleanup } = await guardedFixture();
  try {
    await app.inject({
      method: 'POST',
      url: '/trial/login',
      payload: { code: 'CODE-SENTINEL' },
    });
    const cookie = await login(app);
    await app.inject({
      method: 'POST',
      url: '/api/ask',
      headers: {
        cookie: `${cookie}; tracking=COOKIE-SENTINEL`,
        authorization: 'Bearer AUTH-SENTINEL',
        'content-type': 'application/json',
      },
      payload: { question: 'QUESTION-SENTINEL' },
    });
    const serialized = JSON.stringify(logs);
    for (const sentinel of [
      'CODE-SENTINEL',
      'COOKIE-SENTINEL',
      'AUTH-SENTINEL',
      'QUESTION-SENTINEL',
    ]) {
      assert.doesNotMatch(serialized, new RegExp(sentinel));
    }
    assert.ok(logs.length >= 3);
    assert.deepEqual(Object.keys(logs[0] as object).sort(), [
      'durationMs', 'method', 'requestId', 'route', 'statusCode', 'timestamp',
    ]);
  } finally {
    await cleanup();
  }
});
