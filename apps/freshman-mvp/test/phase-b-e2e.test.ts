import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { verifyPhaseBLiveFlow } from './support/phase-b-live-verifier.js';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const checkScript = path.join(repoRoot, 'scripts', 'test-knowledge-stack.ps1');
const EXACT_DISCLAIMER =
  '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakePhaseBFetch(options: {
  wrongDisclaimer?: boolean;
  reverseReviews?: boolean;
} = {}): typeof globalThis.fetch {
  const reviews: Array<Record<string, unknown>> = [];
  let nextOrdinal = 1;
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/health') {
      return json({
        status: 'ok',
        components: {
          gateway: { status: 'healthy' },
          businessDatabase: { status: 'healthy', mode: 'postgres' },
          weknora: { status: 'healthy' },
          embedding: { status: 'healthy' },
          search: { status: 'healthy' },
          tokenDance: { status: 'configured' },
        },
      });
    }
    if (url.pathname === '/api/questions') {
      return json({
        items: [{
          id: 'campus-card',
          category: '校园生活',
          question: '校园卡怎么办理？',
          summary: '按学院当年通知领取并激活校园卡，地点和时间以官方通知为准。',
          fullAnswer: '完整答案。',
          sources: [{
            type: 'official',
            title: '校园卡通知',
            url: 'https://example.edu/card',
            updatedAt: '2026-07-28',
          }],
          trustStatus: 'approved',
          updatedAt: '2026-07-28T00:00:00.000Z',
          featured: true,
          displayOrder: 1,
        }],
      });
    }
    if (url.pathname === '/api/reviews') {
      return json({
        items: options.reverseReviews ? [...reviews].reverse() : [...reviews],
      });
    }
    if (url.pathname !== '/api/ask' || init?.method !== 'POST') {
      return json({ error: { code: 'NOT_FOUND', message: 'not found' } }, 404);
    }
    const body = JSON.parse(String(init.body)) as { question: string };
    if (body.question === '学校怎么办校园卡') {
      return json({
        route: 'preset',
        trustStatus: 'approved',
        answer: '按学院通知领取。',
        sources: [{
          type: 'official',
          title: '校园卡通知',
          url: 'https://example.edu/card',
          updatedAt: '2026-07-28',
        }],
        intentId: 'campus-card',
      });
    }
    if (body.question === '2025指南里宿舍怎么写的') {
      return json({
        route: 'knowledge',
        trustStatus: 'knowledge',
        answer: '指南提供了宿舍说明。',
        sources: [{
          type: 'community',
          title: '2025年新生指南',
          url: '',
          updatedAt: '2025-08-01',
        }],
      });
    }
    const ordinal = nextOrdinal++;
    reviews.push({
      id: `review-${ordinal}`,
      question: body.question,
      answer: '联网整理结果。',
      sources: [],
      riskLevel: 'medium',
      status: 'pending',
      ordinal,
      createdAt: `2026-07-28T00:00:${String(ordinal).padStart(2, '0')}.000Z`,
      decidedAt: null,
      reviewerId: null,
      decisionNote: null,
      reviewedAnswer: null,
      feedbackTarget: null,
    });
    return json({
      route: 'web',
      trustStatus: 'web-unverified',
      answer: '联网整理结果。',
      sources: [],
      disclaimer: options.wrongDisclaimer ? '错误批注' : EXACT_DISCLAIMER,
      reviewOrdinal: ordinal,
    });
  };
}

test('Phase B static contract is always executable without Docker or credentials', () => {
  const result = spawnSync(
    'pwsh',
    ['-NoProfile', '-File', checkScript, '-StaticOnly'],
    { cwd: repoRoot, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout.trim()) as {
    dockerInvoked: boolean;
    runtimeRoot: string;
    startOrder: string[];
  };
  assert.equal(report.dockerInvoked, false);
  assert.match(report.runtimeRoot, /^D:\\/i);
  assert.deepEqual(report.startOrder, [
    'business-postgres',
    'weknora-and-searxng',
    'gateway',
  ]);
});

test('Phase B live verifier exercises preset, knowledge, exact web disclaimer, and FIFO', async () => {
  const report = await verifyPhaseBLiveFlow({
    baseUrl: 'http://127.0.0.1:3210',
    fetch: fakePhaseBFetch(),
    presetQuestion: '学校怎么办校园卡',
    knowledgeQuestion: '2025指南里宿舍怎么写的',
    unknownQuestion: '一个知识库之外的问题',
    concurrentUnknownCount: 3,
  });
  assert.equal(report.publishedQuestionCount, 1);
  assert.equal(report.presetRoute, 'preset');
  assert.equal(report.knowledgeRoute, 'knowledge');
  assert.equal(report.webRoute, 'web');
  assert.equal(report.initialReviewOrdinal, 1);
  assert.deepEqual(report.concurrentReviewOrdinals, [2, 3, 4]);
  assert.equal(report.pendingReviewsVerified, 4);
});

test('Phase B live verifier rejects an incorrect third-stage disclaimer', async () => {
  await assert.rejects(
    verifyPhaseBLiveFlow({
      baseUrl: 'http://127.0.0.1:3210',
      fetch: fakePhaseBFetch({ wrongDisclaimer: true }),
      presetQuestion: '学校怎么办校园卡',
      knowledgeQuestion: '2025指南里宿舍怎么写的',
      unknownQuestion: '一个知识库之外的问题',
      concurrentUnknownCount: 0,
    }),
    /exact third-stage disclaimer/,
  );
});

test('Phase B live verifier rejects a server review list that is not FIFO', async () => {
  await assert.rejects(
    verifyPhaseBLiveFlow({
      baseUrl: 'http://127.0.0.1:3210',
      fetch: fakePhaseBFetch({ reverseReviews: true }),
      presetQuestion: '学校怎么办校园卡',
      knowledgeQuestion: '2025指南里宿舍怎么写的',
      unknownQuestion: '一个知识库之外的问题',
      concurrentUnknownCount: 2,
    }),
    /created_at ASC, ordinal ASC/,
  );
});

const liveEnabled = process.env.PHASE_B_LIVE_E2E === '1';
test('Phase B live stack satisfies the three-stage API and FIFO contract', {
  skip: liveEnabled ? false : 'PHASE_B_LIVE_E2E=1 is required for the real stack.',
  timeout: 120_000,
}, async () => {
  const presetQuestion = process.env.PHASE_B_E2E_PRESET_QUESTION?.trim();
  const knowledgeQuestion = process.env.PHASE_B_E2E_KNOWLEDGE_QUESTION?.trim();
  const unknownQuestion = process.env.PHASE_B_E2E_UNKNOWN_QUESTION?.trim();
  assert.ok(presetQuestion, 'PHASE_B_E2E_PRESET_QUESTION is required');
  assert.ok(knowledgeQuestion, 'PHASE_B_E2E_KNOWLEDGE_QUESTION is required');
  assert.ok(unknownQuestion, 'PHASE_B_E2E_UNKNOWN_QUESTION is required');
  const report = await verifyPhaseBLiveFlow({
    baseUrl: process.env.PHASE_B_GATEWAY_URL ?? 'http://127.0.0.1:3210',
    fetch: globalThis.fetch,
    presetQuestion,
    knowledgeQuestion,
    unknownQuestion,
    concurrentUnknownCount: 20,
  });
  process.stdout.write(`PHASE_B_LIVE_E2E ${JSON.stringify(report)}\n`);
});
