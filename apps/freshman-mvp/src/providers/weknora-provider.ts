import type {
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeSearchResult,
  ProviderStatus,
} from './contracts.js';

export interface WeKnoraProviderOptions {
  baseUrl: string;
  apiKey: string;
  knowledgeBaseIds: readonly string[];
  scoreThreshold?: number;
  timeoutMs?: number;
  maxHits?: number;
  fetch?: typeof globalThis.fetch;
}

type RawHit = {
  id?: unknown;
  chunk_id?: unknown;
  content?: unknown;
  score?: unknown;
  knowledge_id?: unknown;
  knowledge_title?: unknown;
  knowledge_source?: unknown;
  seq?: unknown;
};

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHit(value: unknown, threshold: number): KnowledgeHit | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as RawHit;
  const content = trimmedString(raw.content);
  const knowledgeId = trimmedString(raw.knowledge_id);
  const chunkId = trimmedString(raw.id) || trimmedString(raw.chunk_id);
  const title = trimmedString(raw.knowledge_title);
  const score = raw.score;
  const sequence = raw.seq;
  if (
    content.length === 0
    || knowledgeId.length === 0
    || chunkId.length === 0
    || title.length === 0
    || typeof score !== 'number'
    || !Number.isFinite(score)
    || score < threshold
    || typeof sequence !== 'number'
    || !Number.isInteger(sequence)
  ) {
    return null;
  }
  const sourceType = trimmedString(raw.knowledge_source) || 'community';
  return {
    content,
    score,
    knowledgeId,
    chunkId,
    title,
    sourceType,
    sequence,
    source: {
      type: 'community',
      title,
      url: '',
      updatedAt: null,
    },
  };
}

export class WeKnoraProvider implements KnowledgeProvider {
  private readonly apiKey: string;
  private readonly knowledgeBaseIds: string[];
  private readonly scoreThreshold: number;
  private readonly timeoutMs: number;
  private readonly maxHits: number;
  private readonly fetch: typeof globalThis.fetch;
  private readonly endpoint: URL | null;
  private readonly configurationStatus: ProviderStatus;
  private lastStatus: ProviderStatus;

  constructor(options: WeKnoraProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.knowledgeBaseIds = [...new Set(
      options.knowledgeBaseIds.map((value) => value.trim()).filter(Boolean),
    )];
    this.scoreThreshold = Number.isFinite(options.scoreThreshold)
      ? Math.max(0, Number(options.scoreThreshold))
      : 0.55;
    this.timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1, Number(options.timeoutMs))
      : 10_000;
    this.maxHits = Number.isFinite(options.maxHits)
      ? Math.max(1, Math.min(8, Math.trunc(Number(options.maxHits))))
      : 8;
    this.fetch = options.fetch ?? globalThis.fetch;

    const baseUrl = options.baseUrl.trim();
    if (baseUrl.length === 0 || this.apiKey.length === 0 || this.knowledgeBaseIds.length < 2) {
      this.endpoint = null;
      this.configurationStatus = 'not-configured';
      this.lastStatus = this.configurationStatus;
      return;
    }
    try {
      const endpoint = new URL(`${baseUrl.replace(/\/+$/u, '')}/knowledge-search`);
      if (!['http:', 'https:'].includes(endpoint.protocol)) {
        throw new Error('unsupported protocol');
      }
      this.endpoint = endpoint;
      this.configurationStatus = 'available';
      this.lastStatus = this.configurationStatus;
    } catch {
      this.endpoint = null;
      this.configurationStatus = 'configuration-error';
      this.lastStatus = this.configurationStatus;
    }
  }

  status(): ProviderStatus {
    return this.lastStatus;
  }

  private result(status: ProviderStatus, hits: KnowledgeHit[] = []): KnowledgeSearchResult {
    this.lastStatus = status;
    return { status, hits };
  }

  async search(question: string): Promise<KnowledgeSearchResult> {
    if (this.configurationStatus !== 'available' || this.endpoint === null) {
      return this.result(this.configurationStatus);
    }
    const query = question.trim();
    if (query.length === 0) {
      return this.result('available');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          query,
          knowledge_base_ids: this.knowledgeBaseIds,
        }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return this.result('configuration-error');
      }
      if (!response.ok) {
        return this.result('temporarily-unavailable');
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return this.result('temporarily-unavailable');
      }
      if (
        typeof body !== 'object'
        || body === null
        || (
          (!('success' in body) || body.success !== true)
          && (!('ok' in body) || body.ok !== true)
        )
        || !('data' in body)
        || !Array.isArray(body.data)
      ) {
        return this.result('temporarily-unavailable');
      }
      const hits = body.data
        .map((item) => normalizeHit(item, this.scoreThreshold))
        .filter((item): item is KnowledgeHit => item !== null)
        .sort((left, right) => left.sequence - right.sequence || right.score - left.score)
        .slice(0, this.maxHits);
      return this.result('available', hits);
    } catch {
      return this.result('temporarily-unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
