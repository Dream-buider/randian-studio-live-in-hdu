import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FaqSyncService,
  WeKnoraFaqClient,
  type FaqOutboxEvent,
  type FaqSyncStore,
} from '../src/services/faq-sync-service.js';
import { createApp } from '../src/server/app.js';

const payload = {
  standardQuestion: '校园一卡通如何领取？',
  similarQuestions: ['学校怎么办校园卡'],
  negativeQuestions: ['校园卡挂失'],
  answers: ['按学院通知领取并激活校园卡。'],
  isEnabled: true,
  isRecommended: true,
};

class MemoryStore implements FaqSyncStore {
  events: FaqOutboxEvent[] = [];
  links = new Map<string, number>();

  async enqueuePublishedVersion(
    intentId: string,
    canonicalVersion: number,
  ): Promise<void> {
    const idempotencyKey = `${intentId}:${canonicalVersion}:weknora-faq`;
    if (this.events.some((event) => event.idempotencyKey === idempotencyKey)) return;
    this.events.push({
      id: `event-${this.events.length + 1}`,
      intentId,
      canonicalVersion,
      idempotencyKey,
      status: 'pending',
      attempts: 0,
      lastError: null,
      payload,
    });
  }

  async claimBatch(limit: number): Promise<FaqOutboxEvent[]> {
    const claimed = this.events
      .filter((event) => event.status === 'pending')
      .slice(0, limit);
    for (const event of claimed) {
      event.status = 'processing';
      event.attempts += 1;
    }
    return structuredClone(claimed);
  }

  async complete(eventId: string, seqId: number): Promise<void> {
    const event = this.events.find((item) => item.id === eventId)!;
    event.status = 'completed';
    event.lastError = null;
    this.links.set(event.intentId, seqId);
  }

  async fail(eventId: string, message: string): Promise<void> {
    const event = this.events.find((item) => item.id === eventId)!;
    event.status = 'failed';
    event.lastError = message;
  }

  async retry(eventId: string): Promise<void> {
    const event = this.events.find((item) => item.id === eventId)!;
    event.status = 'pending';
  }

  async linkedSeqId(intentId: string): Promise<number | null> {
    return this.links.get(intentId) ?? null;
  }
}

test('FAQ synchronization creates then updates documented WeKnora FAQ endpoints', async () => {
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  let nextSeq = 71;
  const client = new WeKnoraFaqClient({
    baseUrl: 'http://127.0.0.1:8080/api/v1',
    apiKey: 'test-api-key',
    knowledgeBaseId: 'kb-faq',
    fetch: async (input, init) => {
      requests.push({
        method: init?.method ?? 'GET',
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ data: { seq_id: nextSeq } });
    },
  });
  const store = new MemoryStore();
  const service = new FaqSyncService(store, client);

  await service.enqueuePublishedVersion('campus-card', 1);
  assert.deepEqual(await service.processBatch(10), { completed: 1, failed: 0 });
  assert.equal(store.links.get('campus-card'), 71);
  assert.equal(requests[0].method, 'POST');
  assert.match(requests[0].url, /\/knowledge-bases\/kb-faq\/faq\/entry$/);
  assert.deepEqual(requests[0].body, {
    standard_question: payload.standardQuestion,
    similar_questions: payload.similarQuestions,
    negative_questions: payload.negativeQuestions,
    answers: payload.answers,
    is_enabled: true,
    is_recommended: true,
  });

  nextSeq = 72;
  await service.enqueuePublishedVersion('campus-card', 2);
  assert.deepEqual(await service.processBatch(10), { completed: 1, failed: 0 });
  assert.equal(requests[1].method, 'PUT');
  assert.match(requests[1].url, /\/knowledge-bases\/kb-faq\/faq\/entries\/71$/);
  assert.equal(store.links.get('campus-card'), 71);
});

test('FAQ synchronization is idempotent and retains retryable failures', async () => {
  const store = new MemoryStore();
  let available = false;
  const service = new FaqSyncService(store, {
    async upsert() {
      if (!available) throw new Error('temporary upstream detail');
      return 81;
    },
  });

  await service.enqueuePublishedVersion('dormitory', 1);
  await service.enqueuePublishedVersion('dormitory', 1);
  assert.equal(store.events.length, 1);
  assert.deepEqual(await service.processBatch(10), { completed: 0, failed: 1 });
  assert.equal(store.events[0].status, 'failed');
  assert.equal(store.events[0].lastError, 'FAQ synchronization failed');

  available = true;
  await service.retry(store.events[0].id);
  assert.deepEqual(await service.processBatch(10), { completed: 1, failed: 0 });
  assert.equal(store.events[0].status, 'completed');
  assert.equal(store.links.get('dormitory'), 81);
});

test('FAQ synchronization does not expose configuration secrets in errors', async () => {
  const client = new WeKnoraFaqClient({
    baseUrl: 'http://127.0.0.1:8080/api/v1',
    apiKey: 'super-secret-key',
    knowledgeBaseId: 'kb-faq',
    fetch: async () => new Response('super-secret-key upstream', { status: 503 }),
  });
  await assert.rejects(
    client.upsert(payload, null),
    (error: Error) => !error.message.includes('super-secret-key'),
  );
});

test('FAQ synchronization exposes a loopback-only retry action without requiring provider success', async () => {
  const retried: string[] = [];
  const app = createApp({
    config: {} as never,
    content: {} as never,
    reviews: {} as never,
    router: { async answer() { return {}; } },
    faqSync: { async retry(id) { retried.push(id); } },
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/integrations/faq/event-1/retry',
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'queued' });
    assert.deepEqual(retried, ['event-1']);
  } finally {
    await app.close();
  }
});
