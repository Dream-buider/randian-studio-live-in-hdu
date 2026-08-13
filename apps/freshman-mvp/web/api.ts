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

export interface KnowledgeImportStatus {
  id: string;
  itemPath: string;
  version: number;
  contentSha256: string;
  title: string;
  sourceType: 'official' | 'community' | 'student';
  sourceUrl: string;
  publishedAt: string;
  applicableYear: number;
  approvedBy: string;
  approvedAt: string;
  ingestMode: 'file' | 'manual';
  knowledgeBaseId: string;
  weknoraKnowledgeId: string | null;
  parseStatus: 'validated' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SystemHealth {
  status: string;
  components: {
    gateway: { status: string };
    businessDatabase: { status: string; mode: string };
    tokenDance: {
      status: string;
      lastCallStatus: string;
      lastCallAt: string | null;
    };
    freshmanGuide?: {
      status: 'available' | 'not-configured' | 'configuration-error';
      mode: 'private-markdown';
      chunks: number;
    };
    weknora: { status: string };
    embedding: { status: string; mode: string };
    search: {
      status: string;
      mode: string;
      lastSearchStatus: string;
      lastSearchAt: string | null;
    };
    reviewQueue: { status: string; pending: number };
    integrationOutbox: {
      status: string;
      pending: number;
      failed: number;
    };
  };
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

export interface ReviewPublication {
  intentId: string;
  version: number;
  createdIntent: boolean;
}

export interface ReviewDecisionResult {
  item: ReviewTask;
  publication: ReviewPublication | null;
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

export type AgentEvidenceLevel = 'existing' | 'prototype' | 'roadmap';
export type AgentTaskStatus =
  | 'created'
  | 'planning'
  | 'awaiting_confirmation'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'needs_human';
export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
export type AgentApprovalStatus = 'not_required' | 'required' | 'approved' | 'rejected';

export interface AgentTaskStep {
  id: string;
  title: string;
  toolName: string;
  status: AgentStepStatus;
  evidenceLevel: AgentEvidenceLevel;
  startedAt: string | null;
  completedAt: string | null;
  resultSummary: string | null;
  error: string | null;
}

export interface AgentTaskEvent {
  id: string;
  type: 'status' | 'tool_started' | 'tool_completed' | 'validation_failed'
    | 'validation_passed' | 'approval_required' | 'artifact_created' | 'retry_requested' | 'retrying';
  stepId: string | null;
  occurredAt: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface AgentArtifact {
  id: string;
  kind: 'rules' | 'brief' | 'outline' | 'compliance' | 'checklist';
  filename: string;
  mimeType: 'text/plain; charset=utf-8' | 'text/markdown; charset=utf-8';
  content: string;
  characterCount: number | null;
  validatedAt: string | null;
}

export interface AgentSource {
  title: string;
  url: string;
  capturedAt: string;
  level: AgentEvidenceLevel;
}

export interface AgentTask {
  id: string;
  scenario: 'goai_initial_submission';
  goal: string;
  deadline: string;
  status: AgentTaskStatus;
  progress: { completed: number; total: number };
  steps: AgentTaskStep[];
  events: AgentTaskEvent[];
  artifacts: AgentArtifact[];
  sources: AgentSource[];
  executionApproval: AgentApprovalStatus;
  externalSubmissionApproval: 'required';
  externalSubmissionStatus: 'awaiting_user_confirmation';
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

const agentEvidenceLevels = ['existing', 'prototype', 'roadmap'] as const;
const agentTaskStatuses = [
  'created', 'planning', 'awaiting_confirmation', 'running', 'verifying', 'completed',
  'failed', 'retrying', 'needs_human',
] as const;
const agentStepStatuses = ['pending', 'running', 'completed', 'failed', 'blocked'] as const;
const agentApprovalStatuses = ['not_required', 'required', 'approved', 'rejected'] as const;
const agentEventTypes = [
  'status', 'tool_started', 'tool_completed', 'validation_failed', 'validation_passed',
  'approval_required', 'artifact_created', 'retry_requested', 'retrying', 'takeover_requested',
] as const;
const agentArtifactKinds = ['rules', 'brief', 'outline', 'compliance', 'checklist'] as const;
const agentMimeTypes = ['text/plain; charset=utf-8', 'text/markdown; charset=utf-8'] as const;

function hasUniqueIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

function isAgentStep(value: unknown): value is AgentTaskStep {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.toolName === 'string'
    && isOneOf(value.status, agentStepStatuses)
    && isOneOf(value.evidenceLevel, agentEvidenceLevels)
    && isStringOrNull(value.startedAt)
    && isStringOrNull(value.completedAt)
    && isStringOrNull(value.resultSummary)
    && isStringOrNull(value.error);
}

function isAgentMetadata(value: unknown): value is Record<string, string | number | boolean | null> {
  return isRecord(value) && Object.values(value).every((item) => (
    item === null || typeof item === 'string' || typeof item === 'boolean'
      || (typeof item === 'number' && Number.isFinite(item))
  ));
}

function isAgentEvent(value: unknown): value is AgentTaskEvent {
  return isRecord(value)
    && typeof value.id === 'string'
    && isOneOf(value.type, agentEventTypes)
    && isStringOrNull(value.stepId)
    && typeof value.occurredAt === 'string'
    && typeof value.summary === 'string'
    && isAgentMetadata(value.metadata);
}

function isAgentArtifact(value: unknown): value is AgentArtifact {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !isOneOf(value.kind, agentArtifactKinds)
    || typeof value.filename !== 'string'
    || !isOneOf(value.mimeType, agentMimeTypes)
    || typeof value.content !== 'string'
    || !(value.characterCount === null || isNonnegativeInteger(value.characterCount))
    || !isStringOrNull(value.validatedAt)
  ) {
    return false;
  }
  if (value.kind !== 'brief') {
    return true;
  }
  return value.filename.endsWith('.txt')
    && value.mimeType === 'text/plain; charset=utf-8'
    && (value.characterCount === null
      || value.characterCount === Array.from(value.content.trim()).length);
}

function isAgentSource(value: unknown): value is AgentSource {
  return isRecord(value)
    && typeof value.title === 'string' && value.title.trim().length > 0
    && typeof value.url === 'string' && value.url.trim().length > 0
    && typeof value.capturedAt === 'string' && value.capturedAt.trim().length > 0
    && isOneOf(value.level, agentEvidenceLevels);
}

export function isAgentTask(value: unknown): value is AgentTask {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || value.scenario !== 'goai_initial_submission'
    || typeof value.goal !== 'string'
    || typeof value.deadline !== 'string'
    || !isOneOf(value.status, agentTaskStatuses)
    || !isRecord(value.progress)
    || !isNonnegativeInteger(value.progress.completed)
    || !isNonnegativeInteger(value.progress.total)
    || !Array.isArray(value.steps) || !value.steps.every(isAgentStep)
    || !Array.isArray(value.events) || !value.events.every(isAgentEvent)
    || !Array.isArray(value.artifacts) || !value.artifacts.every(isAgentArtifact)
    || !Array.isArray(value.sources) || !value.sources.every(isAgentSource)
    || !isOneOf(value.executionApproval, agentApprovalStatuses)
    || !(value.executionStartedAt === undefined || isStringOrNull(value.executionStartedAt))
    || value.externalSubmissionApproval !== 'required'
    || value.externalSubmissionStatus !== 'awaiting_user_confirmation'
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string'
  ) {
    return false;
  }

  const progress = value.progress as { completed: number; total: number };
  const steps = value.steps as AgentTaskStep[];
  const events = value.events as AgentTaskEvent[];
  const artifacts = value.artifacts as AgentArtifact[];
  if (
    progress.total !== steps.length
    || progress.completed !== steps.filter((step) => step.status === 'completed').length
    || progress.completed > progress.total
    || !hasUniqueIds(steps)
    || !hasUniqueIds(events)
    || !hasUniqueIds(artifacts)
  ) {
    return false;
  }

  const submitStep = steps[6];
  if (!submitStep || submitStep.id !== 'submit' || submitStep.evidenceLevel !== 'roadmap') {
    return false;
  }
  if (value.status === 'completed' && submitStep.status === 'completed') {
    return false;
  }

  const briefs = artifacts.filter((artifact) => artifact.kind === 'brief');
  return value.status !== 'completed' || (
    briefs.length > 0 && briefs.every((brief) => Array.from(brief.content.trim()).length === 492)
  );
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

function isKnowledgeImportStatus(value: unknown): value is KnowledgeImportStatus {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.itemPath === 'string'
    && typeof value.version === 'number'
    && typeof value.contentSha256 === 'string'
    && typeof value.title === 'string'
    && ['official', 'community', 'student'].includes(String(value.sourceType))
    && typeof value.sourceUrl === 'string'
    && typeof value.publishedAt === 'string'
    && typeof value.applicableYear === 'number'
    && typeof value.approvedBy === 'string'
    && typeof value.approvedAt === 'string'
    && ['file', 'manual'].includes(String(value.ingestMode))
    && typeof value.knowledgeBaseId === 'string'
    && (value.weknoraKnowledgeId === null || typeof value.weknoraKnowledgeId === 'string')
    && ['validated', 'pending', 'processing', 'completed', 'failed', 'cancelled']
      .includes(String(value.parseStatus))
    && (value.lastError === null || typeof value.lastError === 'string')
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function isSystemHealth(value: unknown): value is SystemHealth {
  if (!isRecord(value) || typeof value.status !== 'string' || !isRecord(value.components)) {
    return false;
  }
  const {
    gateway,
    businessDatabase,
    tokenDance,
    freshmanGuide,
    weknora,
    embedding,
    search,
    reviewQueue,
    integrationOutbox,
  } = value.components;
  return isRecord(gateway)
    && typeof gateway.status === 'string'
    && isRecord(businessDatabase)
    && typeof businessDatabase.status === 'string'
    && typeof businessDatabase.mode === 'string'
    && isRecord(tokenDance)
    && typeof tokenDance.status === 'string'
    && typeof tokenDance.lastCallStatus === 'string'
    && (tokenDance.lastCallAt === null || typeof tokenDance.lastCallAt === 'string')
    && (freshmanGuide === undefined || (
      isRecord(freshmanGuide)
      && ['available', 'not-configured', 'configuration-error']
        .includes(String(freshmanGuide.status))
      && freshmanGuide.mode === 'private-markdown'
      && Number.isSafeInteger(freshmanGuide.chunks)
      && Number(freshmanGuide.chunks) >= 0
    ))
    && isRecord(weknora)
    && typeof weknora.status === 'string'
    && isRecord(embedding)
    && typeof embedding.status === 'string'
    && typeof embedding.mode === 'string'
    && isRecord(search)
    && typeof search.status === 'string'
    && typeof search.mode === 'string'
    && typeof search.lastSearchStatus === 'string'
    && (search.lastSearchAt === null || typeof search.lastSearchAt === 'string')
    && isRecord(reviewQueue)
    && typeof reviewQueue.status === 'string'
    && Number.isSafeInteger(reviewQueue.pending)
    && Number(reviewQueue.pending) >= 0
    && isRecord(integrationOutbox)
    && typeof integrationOutbox.status === 'string'
    && Number.isSafeInteger(integrationOutbox.pending)
    && Number(integrationOutbox.pending) >= 0
    && Number.isSafeInteger(integrationOutbox.failed)
    && Number(integrationOutbox.failed) >= 0;
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
    throw new ApiResponseError(response.status);
  }
}

async function readAgentTask(response: Response): Promise<AgentTask> {
  const body = await readJson(response);
  if (!isAgentTask(body)) {
    throw new ApiResponseError(response.status);
  }
  return body;
}

export async function createAgentTask(goal: string): Promise<AgentTask> {
  return readAgentTask(await fetch('/api/agent/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal }),
  }));
}

export async function getAgentTask(id: string): Promise<AgentTask> {
  return readAgentTask(await fetch(`/api/agent/tasks/${encodeURIComponent(id)}`));
}

export async function confirmAgentTask(id: string): Promise<AgentTask> {
  return readAgentTask(await fetch(`/api/agent/tasks/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
  }));
}

export async function runAgentTask(id: string): Promise<AgentTask> {
  return readAgentTask(await fetch(`/api/agent/tasks/${encodeURIComponent(id)}/run`, {
    method: 'POST',
  }));
}

export async function retryAgentTask(id: string): Promise<AgentTask> {
  return readAgentTask(await fetch(`/api/agent/tasks/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
  }));
}

export function agentArtifactUrl(taskId: string, artifactId: string): string {
  return `/api/agent/tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(artifactId)}`;
}

export interface ListQuestionsOptions {
  fetcher?: typeof fetch;
}

export interface AskQuestionOptions {
  fetcher?: typeof fetch;
}

export function isUiPreviewMode(mode: string): boolean {
  return mode === 'ui-preview';
}

async function loadPreviewQuestions(): Promise<PublishedQuestion[]> {
  const { UI_PREVIEW_QUESTIONS } = await import('./mock/questions.js');
  return UI_PREVIEW_QUESTIONS.map((item) => ({
    ...item,
    sources: item.sources.map((source) => ({ ...source })),
  }));
}

async function loadPreviewAnswer(
  question: string,
  context?: QuestionContext,
): Promise<AnswerResult> {
  const { createUiPreviewAnswer } = await import('./mock/answers.js');
  return createUiPreviewAnswer(question, context);
}

export async function listQuestions(
  options: ListQuestionsOptions = {},
): Promise<PublishedQuestion[]> {
  if (import.meta.env.MODE === 'ui-preview') {
    return loadPreviewQuestions();
  }
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher('/api/questions');
  const body = await readJson(response);
  if (!isRecord(body) || !Array.isArray(body.items) || !body.items.every(isPublishedQuestion)) {
    throw new ApiResponseError();
  }
  return body.items;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const response = await fetch('/api/health');
  const body = await readJson(response);
  if (!isSystemHealth(body)) {
    throw new ApiResponseError(response.status);
  }
  return body;
}

export async function askQuestion(
  question: string,
  context?: QuestionContext,
  requestId?: string,
  options: AskQuestionOptions = {},
): Promise<AnswerResult> {
  if (import.meta.env.MODE === 'ui-preview') {
    return loadPreviewAnswer(question, context);
  }
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher('/api/ask', {
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

export async function listKnowledgeImports(): Promise<{
  configured: boolean;
  items: KnowledgeImportStatus[];
}> {
  const response = await fetch('/api/admin/knowledge-imports');
  const body = await readJson(response);
  if (
    !isRecord(body)
    || typeof body.configured !== 'boolean'
    || !Array.isArray(body.items)
    || !body.items.every(isKnowledgeImportStatus)
  ) {
    throw new ApiResponseError(response.status);
  }
  return { configured: body.configured, items: body.items };
}

export async function retryKnowledgeImport(id: string): Promise<void> {
  const response = await fetch(
    `/api/admin/knowledge-imports/${encodeURIComponent(id)}/retry`,
    { method: 'POST' },
  );
  const body = await readJson(response);
  if (!response.ok || !isRecord(body) || body.status !== 'queued') {
    throw new ApiResponseError(response.status);
  }
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
): Promise<ReviewDecisionResult> {
  const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJson(response);
  const publication = isRecord(body) ? body.publication : undefined;
  const validPublication = isRecord(publication)
    && typeof publication.intentId === 'string'
    && typeof publication.version === 'number'
    && typeof publication.createdIntent === 'boolean';
  if (
    !isRecord(body)
    || !isReviewTask(body.item)
    || (input.status === 'approved' && !validPublication)
  ) {
    throw new ApiResponseError(response.status);
  }
  return {
    item: body.item,
    publication: validPublication ? {
      intentId: publication.intentId as string,
      version: publication.version as number,
      createdIntent: publication.createdIntent as boolean,
    } : null,
  };
}
