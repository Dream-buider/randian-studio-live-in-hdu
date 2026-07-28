const EXACT_DISCLAIMER =
  '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别';

type JsonRecord = Record<string, unknown>;

export interface PhaseBLiveVerifierOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  presetQuestion: string;
  knowledgeQuestion: string;
  unknownQuestion: string;
  concurrentUnknownCount: number;
}

export interface PhaseBLiveVerifierReport {
  healthStatus: 'ok';
  publishedQuestionCount: number;
  presetRoute: 'preset';
  knowledgeRoute: 'knowledge';
  webRoute: 'web';
  initialReviewOrdinal: number;
  concurrentReviewOrdinals: number[];
  pendingReviewsVerified: number;
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a JSON array`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-blank string`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return Number(value);
}

function joinUrl(baseUrl: string, pathname: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(pathname.replace(/^\//, ''), normalized).href;
}

async function requestJson(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  init?: RequestInit,
): Promise<JsonRecord> {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).pathname}`);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error(`Non-JSON response from ${new URL(url).pathname}`);
  }
  return record(await response.json(), new URL(url).pathname);
}

function componentStatus(
  components: JsonRecord,
  name: string,
  allowed: readonly string[],
): JsonRecord {
  const component = record(components[name], `health.components.${name}`);
  if (!allowed.includes(String(component.status))) {
    throw new Error(
      `health.components.${name}.status must be one of ${allowed.join(', ')}`,
    );
  }
  return component;
}

async function ask(
  options: PhaseBLiveVerifierOptions,
  question: string,
  requestId: string,
): Promise<JsonRecord> {
  return requestJson(
    options.fetch,
    joinUrl(options.baseUrl, '/api/ask'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, requestId }),
    },
  );
}

function requireSources(body: JsonRecord, label: string): void {
  const sources = array(body.sources, `${label}.sources`);
  if (sources.length === 0) {
    throw new Error(`${label}.sources must contain at least one citation`);
  }
  for (const [index, source] of sources.entries()) {
    const sourceRecord = record(source, `${label}.sources[${index}]`);
    text(sourceRecord.title, `${label}.sources[${index}].title`);
  }
}

function assertReviewFifo(items: unknown[]): Array<{ ordinal: number; createdAt: string }> {
  const normalized = items.map((value, index) => {
    const item = record(value, `reviews.items[${index}]`);
    return {
      ordinal: integer(item.ordinal, `reviews.items[${index}].ordinal`),
      createdAt: text(item.createdAt, `reviews.items[${index}].createdAt`),
    };
  });
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1]!;
    const current = normalized[index]!;
    const previousTime = Date.parse(previous.createdAt);
    const currentTime = Date.parse(current.createdAt);
    if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) {
      throw new Error('review createdAt must be a valid timestamp');
    }
    if (
      previousTime > currentTime
      || (previousTime === currentTime && previous.ordinal >= current.ordinal)
    ) {
      throw new Error('review list must be created_at ASC, ordinal ASC');
    }
  }
  return normalized;
}

export async function verifyPhaseBLiveFlow(
  options: PhaseBLiveVerifierOptions,
): Promise<PhaseBLiveVerifierReport> {
  if (options.concurrentUnknownCount < 0 || options.concurrentUnknownCount > 20) {
    throw new Error('concurrentUnknownCount must be between 0 and 20');
  }
  const runToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const health = await requestJson(
    options.fetch,
    joinUrl(options.baseUrl, '/api/health'),
  );
  if (health.status !== 'ok') {
    throw new Error('gateway health status must be ok');
  }
  const components = record(health.components, 'health.components');
  componentStatus(components, 'gateway', ['healthy']);
  const database = componentStatus(components, 'businessDatabase', ['healthy']);
  if (database.mode !== 'postgres') {
    throw new Error('Phase B business database must run in postgres mode');
  }
  componentStatus(components, 'weknora', ['healthy', 'available', 'configured']);
  componentStatus(components, 'embedding', ['healthy', 'available', 'configured']);
  componentStatus(components, 'search', ['healthy', 'available', 'configured']);
  componentStatus(components, 'tokenDance', ['healthy', 'available', 'configured']);

  const questionEnvelope = await requestJson(
    options.fetch,
    joinUrl(options.baseUrl, '/api/questions'),
  );
  const publishedQuestions = array(questionEnvelope.items, 'questions.items');
  if (publishedQuestions.length === 0) {
    throw new Error('Phase B live verification requires at least one published question');
  }

  const preset = await ask(
    options,
    options.presetQuestion,
    `phase-b-e2e-${runToken}-preset`,
  );
  if (preset.route !== 'preset' || preset.trustStatus !== 'approved') {
    throw new Error('preset query must return preset / approved');
  }
  requireSources(preset, 'preset');

  const knowledge = await ask(
    options,
    options.knowledgeQuestion,
    `phase-b-e2e-${runToken}-knowledge`,
  );
  if (knowledge.route !== 'knowledge' || knowledge.trustStatus !== 'knowledge') {
    throw new Error('knowledge query must return knowledge / knowledge');
  }
  requireSources(knowledge, 'knowledge');

  const initialWeb = await ask(
    options,
    `${options.unknownQuestion} [LIVE-E2E-${runToken}-initial]`,
    `phase-b-e2e-${runToken}-web-initial`,
  );
  if (initialWeb.route !== 'web' || initialWeb.trustStatus !== 'web-unverified') {
    throw new Error('unknown query must return web / web-unverified');
  }
  if (initialWeb.disclaimer !== EXACT_DISCLAIMER) {
    throw new Error('unknown query must contain the exact third-stage disclaimer');
  }
  const initialReviewOrdinal = integer(
    initialWeb.reviewOrdinal,
    'web.reviewOrdinal',
  );

  const concurrent = await Promise.all(
    Array.from({ length: options.concurrentUnknownCount }, async (_, index) => {
      const result = await ask(
        options,
        `${options.unknownQuestion} [LIVE-E2E-${runToken}-${index + 1}]`,
        `phase-b-e2e-${runToken}-web-${index + 1}`,
      );
      if (result.route !== 'web' || result.trustStatus !== 'web-unverified') {
        throw new Error(`concurrent unknown query ${index + 1} must return web`);
      }
      if (result.disclaimer !== EXACT_DISCLAIMER) {
        throw new Error(
          `concurrent unknown query ${index + 1} must contain the exact third-stage disclaimer`,
        );
      }
      return integer(
        result.reviewOrdinal,
        `concurrent[${index}].reviewOrdinal`,
      );
    }),
  );
  const expectedOrdinals = [initialReviewOrdinal, ...concurrent];
  if (new Set(expectedOrdinals).size !== expectedOrdinals.length) {
    throw new Error('web fallback review ordinals must be unique');
  }

  const reviewEnvelope = await requestJson(
    options.fetch,
    joinUrl(options.baseUrl, '/api/reviews?status=pending'),
  );
  const orderedReviews = assertReviewFifo(
    array(reviewEnvelope.items, 'reviews.items'),
  );
  const observedOrdinals = new Set(orderedReviews.map((item) => item.ordinal));
  for (const ordinal of expectedOrdinals) {
    if (!observedOrdinals.has(ordinal)) {
      throw new Error(`review ordinal ${ordinal} was not persisted before return`);
    }
  }

  return {
    healthStatus: 'ok',
    publishedQuestionCount: publishedQuestions.length,
    presetRoute: 'preset',
    knowledgeRoute: 'knowledge',
    webRoute: 'web',
    initialReviewOrdinal,
    concurrentReviewOrdinals: concurrent,
    pendingReviewsVerified: expectedOrdinals.length,
  };
}
