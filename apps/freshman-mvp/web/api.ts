export type TrustStatus = 'approved' | 'knowledge' | 'web-unverified';

export const STAGE_THREE_DISCLAIMER =
  '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别';

export interface SourceRef {
  type: 'official' | 'community' | 'student' | 'web';
  title: string;
  url: string;
  updatedAt: string | null;
}

export interface PublishedQuestion {
  id: string;
  category: string;
  question: string;
  summary: string;
  fullAnswer: string;
  sources: SourceRef[];
  trustStatus: 'approved';
  updatedAt: string;
  featured: boolean;
  displayOrder: number;
}

export interface QuestionContext {
  intentId: string | null;
  question: string;
  category: string | null;
}

export type AnswerResult =
  | {
    route: 'preset';
    trustStatus: 'approved';
    answer: string;
    sources: SourceRef[];
    intentId: string;
  }
  | {
    route: 'knowledge';
    trustStatus: 'knowledge';
    answer: string;
    sources: SourceRef[];
  }
  | {
    route: 'web';
    trustStatus: 'web-unverified';
    answer: string;
    sources: SourceRef[];
    disclaimer: string;
    reviewOrdinal: number;
  };

export function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

class ApiResponseError extends Error {
  constructor() {
    super('API response could not be read');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is SourceRef {
  return isRecord(value)
    && ['official', 'community', 'student', 'web'].includes(String(value.type))
    && typeof value.title === 'string'
    && typeof value.url === 'string'
    && (value.updatedAt === null || typeof value.updatedAt === 'string');
}

function isPublishedQuestion(value: unknown): value is PublishedQuestion {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.category === 'string'
    && typeof value.question === 'string'
    && typeof value.summary === 'string'
    && typeof value.fullAnswer === 'string'
    && Array.isArray(value.sources)
    && value.sources.every(isSource)
    && value.trustStatus === 'approved'
    && typeof value.updatedAt === 'string'
    && typeof value.featured === 'boolean'
    && typeof value.displayOrder === 'number';
}

export function isAnswerResult(value: unknown): value is AnswerResult {
  if (
    !isRecord(value)
    || typeof value.answer !== 'string'
    || !Array.isArray(value.sources)
    || !value.sources.every(isSource)
  ) {
    return false;
  }
  if (value.route === 'preset') {
    return value.trustStatus === 'approved' && typeof value.intentId === 'string';
  }
  if (value.route === 'knowledge') {
    return value.trustStatus === 'knowledge';
  }
  return value.route === 'web'
    && value.trustStatus === 'web-unverified'
    && value.disclaimer === STAGE_THREE_DISCLAIMER
    && typeof value.reviewOrdinal === 'number';
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new ApiResponseError();
  }
  try {
    return await response.json() as unknown;
  } catch {
    throw new ApiResponseError();
  }
}

export async function listQuestions(): Promise<PublishedQuestion[]> {
  const response = await fetch('/api/questions');
  const body = await readJson(response);
  if (!isRecord(body) || !Array.isArray(body.items) || !body.items.every(isPublishedQuestion)) {
    throw new ApiResponseError();
  }
  return body.items;
}

export async function askQuestion(
  question: string,
  context?: QuestionContext,
  requestId?: string,
): Promise<AnswerResult> {
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, context, requestId }),
  });
  const body = await readJson(response);
  if (!isAnswerResult(body)) {
    throw new ApiResponseError();
  }
  return body;
}
