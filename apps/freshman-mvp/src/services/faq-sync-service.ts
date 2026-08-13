export type FaqOutboxStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface FaqPayload {
  standardQuestion: string;
  similarQuestions: string[];
  negativeQuestions: string[];
  answers: string[];
  isEnabled: boolean;
  isRecommended: boolean;
}

export interface FaqOutboxEvent {
  id: string;
  intentId: string;
  canonicalVersion: number;
  idempotencyKey: string;
  status: FaqOutboxStatus;
  attempts: number;
  lastError: string | null;
  payload: FaqPayload;
}

export interface FaqSyncStore {
  enqueuePublishedVersion(intentId: string, canonicalVersion: number): Promise<void>;
  claimBatch(limit: number): Promise<FaqOutboxEvent[]>;
  complete(eventId: string, seqId: number): Promise<void>;
  fail(eventId: string, safeMessage: string): Promise<void>;
  retry(eventId: string): Promise<void>;
  linkedSeqId(intentId: string): Promise<number | null>;
}

export interface FaqClient {
  upsert(payload: FaqPayload, existingSeqId: number | null): Promise<number>;
}

interface WeKnoraFaqClientOptions {
  baseUrl: string;
  apiKey: string;
  knowledgeBaseId: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is not configured`);
  }
  return trimmed;
}

function asSeqId(value: unknown): number | null {
  const candidate = (
    typeof value === 'object'
    && value !== null
    && 'data' in value
  )
    ? value.data
    : value;
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }
  const rawId = 'seq_id' in candidate
    ? candidate.seq_id
    : ('id' in candidate ? candidate.id : null);
  const seqId = Number(rawId);
  return Number.isSafeInteger(seqId) && seqId > 0 ? seqId : null;
}

export class WeKnoraFaqClient implements FaqClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly knowledgeBaseId: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: WeKnoraFaqClientOptions) {
    this.baseUrl = required(options.baseUrl, 'WeKnora base URL').replace(/\/+$/u, '');
    this.apiKey = required(options.apiKey, 'WeKnora API key');
    this.knowledgeBaseId = required(options.knowledgeBaseId, 'WeKnora FAQ knowledge base ID');
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async upsert(payload: FaqPayload, existingSeqId: number | null): Promise<number> {
    const basePath = `${this.baseUrl}/knowledge-bases/${
      encodeURIComponent(this.knowledgeBaseId)
    }/faq`;
    const endpoint = existingSeqId === null
      ? `${basePath}/entry`
      : `${basePath}/entries/${existingSeqId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(endpoint, {
        method: existingSeqId === null ? 'POST' : 'PUT',
        headers: {
          'content-type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          standard_question: payload.standardQuestion,
          similar_questions: payload.similarQuestions,
          negative_questions: payload.negativeQuestions,
          answers: payload.answers,
          is_enabled: payload.isEnabled,
          is_recommended: payload.isRecommended,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('WeKnora FAQ request failed');
      }
      const body = await response.json() as unknown;
      if (existingSeqId !== null) {
        return existingSeqId;
      }
      const seqId = asSeqId(body);
      if (seqId === null) {
        throw new Error('WeKnora FAQ response is invalid');
      }
      return seqId;
    } catch {
      throw new Error('WeKnora FAQ is temporarily unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class FaqSyncService {
  constructor(
    private readonly store: FaqSyncStore,
    private readonly client: FaqClient,
  ) {}

  async enqueuePublishedVersion(
    intentId: string,
    canonicalVersion: number,
  ): Promise<void> {
    await this.store.enqueuePublishedVersion(intentId, canonicalVersion);
  }

  async processBatch(limit: number): Promise<{ completed: number; failed: number }> {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 10));
    const events = await this.store.claimBatch(boundedLimit);
    let completed = 0;
    let failed = 0;
    for (const event of events) {
      try {
        const existingSeqId = await this.store.linkedSeqId(event.intentId);
        const seqId = await this.client.upsert(event.payload, existingSeqId);
        await this.store.complete(event.id, seqId);
        completed += 1;
      } catch {
        await this.store.fail(event.id, 'FAQ synchronization failed');
        failed += 1;
      }
    }
    return { completed, failed };
  }

  async retry(outboxId: string): Promise<void> {
    await this.store.retry(outboxId);
  }
}
