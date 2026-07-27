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

export interface RawAnswer {
  id: string;
  intentId: string;
  answer: string;
  sourceLabel: string;
  sourceCell: string;
  createdAt: string;
}

export interface AdminIntent {
  id: string;
  externalId: string | null;
  category: string;
  question: string;
  intentDescription: string;
  aliases: string[];
  keywords: string[];
  excludeKeywords: string[];
  active: boolean;
  featured: boolean;
  displayOrder: number;
  rawAnswerCount: number;
  publishedAnswer: PublishedQuestion | null;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_more';

export interface ReviewTask {
  id: string;
  question: string;
  answer: string;
  sources: SourceRef[];
  riskLevel: 'low' | 'medium' | 'high';
  status: ReviewStatus;
  ordinal: number;
  createdAt: string;
  decidedAt: string | null;
  reviewerId: string | null;
  decisionNote: string | null;
  reviewedAnswer: string | null;
  feedbackTarget: string | null;
}

export interface PublishAnswerInput {
  summary: string;
  fullAnswer: string;
  sources: SourceRef[];
  reviewerId: string;
}

export interface ReviewDecisionInput {
  status: Exclude<ReviewStatus, 'pending'>;
  reviewerId: string;
  note: string;
  reviewedAnswer: string | null;
  feedbackTarget: string;
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

export class ApiResponseError extends Error {
  readonly status: number | null;

  constructor(status: number | null = null) {
    super('API response could not be read');
    this.status = status;
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

function isRawAnswer(value: unknown): value is RawAnswer {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.intentId === 'string'
    && typeof value.answer === 'string'
    && typeof value.sourceLabel === 'string'
    && typeof value.sourceCell === 'string'
    && typeof value.createdAt === 'string';
}

function isAdminIntent(value: unknown): value is AdminIntent {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.externalId === null || typeof value.externalId === 'string')
    && typeof value.category === 'string'
    && typeof value.question === 'string'
    && typeof value.intentDescription === 'string'
    && Array.isArray(value.aliases)
    && value.aliases.every((item) => typeof item === 'string')
    && Array.isArray(value.keywords)
    && value.keywords.every((item) => typeof item === 'string')
    && Array.isArray(value.excludeKeywords)
    && value.excludeKeywords.every((item) => typeof item === 'string')
    && typeof value.active === 'boolean'
    && typeof value.featured === 'boolean'
    && typeof value.displayOrder === 'number'
    && typeof value.rawAnswerCount === 'number'
    && (value.publishedAnswer === null || isPublishedQuestion(value.publishedAnswer));
}

function isReviewTask(value: unknown): value is ReviewTask {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.question === 'string'
    && typeof value.answer === 'string'
    && Array.isArray(value.sources)
    && value.sources.every(isSource)
    && ['low', 'medium', 'high'].includes(String(value.riskLevel))
    && ['pending', 'approved', 'rejected', 'needs_more'].includes(String(value.status))
    && typeof value.ordinal === 'number'
    && typeof value.createdAt === 'string'
    && (value.decidedAt === null || typeof value.decidedAt === 'string')
    && (value.reviewerId === null || typeof value.reviewerId === 'string')
    && (value.decisionNote === null || typeof value.decisionNote === 'string')
    && (value.reviewedAnswer === null || typeof value.reviewedAnswer === 'string')
    && (value.feedbackTarget === null || typeof value.feedbackTarget === 'string');
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
  if (!response.ok) {
    throw new ApiResponseError(response.status);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new ApiResponseError(response.status);
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

async function readItems<T>(
  response: Response,
  predicate: (value: unknown) => value is T,
): Promise<T[]> {
  const body = await readJson(response);
  if (!isRecord(body) || !Array.isArray(body.items) || !body.items.every(predicate)) {
    throw new ApiResponseError(response.status);
  }
  return body.items;
}

export async function listAdminIntents(): Promise<AdminIntent[]> {
  return readItems(await fetch('/api/admin/intents'), isAdminIntent);
}

export async function listRawAnswers(intentId: string): Promise<RawAnswer[]> {
  return readItems(
    await fetch(`/api/admin/intents/${encodeURIComponent(intentId)}/raw-answers`),
    isRawAnswer,
  );
}

export async function listPendingReviews(): Promise<ReviewTask[]> {
  return readItems(await fetch('/api/reviews?status=pending'), isReviewTask);
}

export async function publishAnswer(
  intentId: string,
  input: PublishAnswerInput,
): Promise<{ id: string; version: number }> {
  const response = await fetch(`/api/admin/intents/${encodeURIComponent(intentId)}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJson(response);
  if (!isRecord(body) || typeof body.id !== 'string' || typeof body.version !== 'number') {
    throw new ApiResponseError(response.status);
  }
  return { id: body.id, version: body.version };
}

export async function decideReview(
  reviewId: string,
  input: ReviewDecisionInput,
): Promise<ReviewTask> {
  const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJson(response);
  if (!isRecord(body) || !isReviewTask(body.item)) {
    throw new ApiResponseError(response.status);
  }
  return body.item;
}
