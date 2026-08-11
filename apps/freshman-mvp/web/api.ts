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

export type RoommateCampusCode = 'xiasha' | 'shaoxing';
export type RoommateOrientation = 'south' | 'north';
export type RoommateContactType = 'wechat' | 'qq' | 'phone' | 'other';
export type RoommateRegistrationStatus = 'active' | 'hidden' | 'deleted' | 'expired';

export type RoommateCampusTemplate =
  | {
    code: 'xiasha';
    name: string;
    templateVersion: 'xiasha-v1';
    enabled: true;
  }
  | {
    code: 'shaoxing';
    name: string;
    templateVersion: null;
    enabled: false;
    unavailableReason: string;
  };

export interface RoommateConfig {
  enabled: boolean;
  retentionDays: number;
  campuses: RoommateCampusTemplate[];
}

export interface RoommateAddressInput {
  campus: RoommateCampusCode;
  building: string;
  orientation: RoommateOrientation;
  room: string;
}

export interface RoommateAddress extends RoommateAddressInput {
  templateVersion: 'xiasha-v1';
  canonical: string;
  display: string;
}

export interface RoommateContact {
  type: RoommateContactType;
  value: string;
}

export interface RoommateSelf {
  id: string;
  address: RoommateAddress;
  nickname: string;
  contact: RoommateContact | null;
  status: RoommateRegistrationStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  deletedAt: string | null;
}

export interface RoommateMember {
  id: string;
  nickname: string;
  contact: RoommateContact | null;
}

export interface RoommateRecoveryCredential {
  registrationId: string;
  managementCode: string;
}

export interface RoommateAdminItem extends Omit<RoommateSelf, 'contact'> {
  contact: { type: RoommateContactType; masked: true } | null;
}

export interface RoommateRegistrationInput {
  address: RoommateAddressInput;
  nickname: string;
  contactType: RoommateContactType | null;
  contactValue: string | null;
  consent: boolean;
}

export interface RoommateRegistrationResult {
  registrationId: string;
  managementCode: string | null;
  own: RoommateSelf;
  members: RoommateMember[];
}

export interface RoommateRecoveryResult {
  registrationId: string;
  own: RoommateSelf;
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
    super(safeApiErrorMessage(status));
    this.status = status;
  }
}

function safeApiErrorMessage(status: number | null): string {
  switch (status) {
    case 400:
      return '填写内容有误，请检查后重试';
    case 401:
      return '当前登记会话已失效，请重新恢复';
    case 403:
      return '当前请求无法完成';
    case 404:
      return '未找到相关登记';
    case 409:
      return '登记信息发生冲突，请刷新后重试';
    case 429:
      return '请求过于频繁，请稍后再试';
    case 503:
      return '室友匹配暂不可用，请稍后再试';
    default:
      return '请求失败，请稍后再试';
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

function isRoommateCampusTemplate(value: unknown): value is RoommateCampusTemplate {
  if (
    !isRecord(value)
    || typeof value.name !== 'string'
    || typeof value.enabled !== 'boolean'
  ) {
    return false;
  }
  if (value.code === 'xiasha') {
    return value.enabled === true && value.templateVersion === 'xiasha-v1';
  }
  return value.code === 'shaoxing'
    && value.enabled === false
    && value.templateVersion === null
    && typeof value.unavailableReason === 'string';
}

function isRoommateConfig(value: unknown): value is RoommateConfig {
  return isRecord(value)
    && typeof value.enabled === 'boolean'
    && Number.isSafeInteger(value.retentionDays)
    && Number(value.retentionDays) > 0
    && Array.isArray(value.campuses)
    && value.campuses.every(isRoommateCampusTemplate);
}

function isRoommateContactType(value: unknown): value is RoommateContactType {
  return typeof value === 'string'
    && ['wechat', 'qq', 'phone', 'other'].includes(value);
}

function isRoommateStatus(value: unknown): value is RoommateRegistrationStatus {
  return typeof value === 'string'
    && ['active', 'hidden', 'deleted', 'expired'].includes(value);
}

function isRoommateContact(value: unknown): value is RoommateContact {
  return isRecord(value)
    && isRoommateContactType(value.type)
    && typeof value.value === 'string';
}

function isRoommateAddress(value: unknown): value is RoommateAddress {
  return isRecord(value)
    && value.campus === 'xiasha'
    && value.templateVersion === 'xiasha-v1'
    && typeof value.building === 'string'
    && (value.orientation === 'south' || value.orientation === 'north')
    && typeof value.room === 'string'
    && typeof value.canonical === 'string'
    && typeof value.display === 'string';
}

function isRoommateSelf(value: unknown): value is RoommateSelf {
  return isRecord(value)
    && typeof value.id === 'string'
    && isRoommateAddress(value.address)
    && typeof value.nickname === 'string'
    && (value.contact === null || isRoommateContact(value.contact))
    && isRoommateStatus(value.status)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && typeof value.expiresAt === 'string'
    && (value.deletedAt === null || typeof value.deletedAt === 'string');
}

function isRoommateMember(value: unknown): value is RoommateMember {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.nickname === 'string'
    && (value.contact === null || isRoommateContact(value.contact));
}

function containsRawSessionToken(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsRawSessionToken);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(value, 'sessionToken')
    || Object.values(value).some(containsRawSessionToken);
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
    throw new ApiResponseError();
  }
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

export interface RoommateApiOptions {
  fetcher?: typeof fetch;
}

function roommateFetch(
  path: string,
  init: RequestInit | undefined,
  options: RoommateApiOptions,
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  return fetcher(path, init
    ? { ...init, credentials: 'same-origin' }
    : { credentials: 'same-origin' });
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function projectRoommateRegistrationInput(
  input: RoommateRegistrationInput,
): RoommateRegistrationInput {
  if (
    !isRecord(input)
    || !isRecord(input.address)
    || (input.address.campus !== 'xiasha' && input.address.campus !== 'shaoxing')
    || typeof input.address.building !== 'string'
    || (input.address.orientation !== 'south' && input.address.orientation !== 'north')
    || typeof input.address.room !== 'string'
    || typeof input.nickname !== 'string'
    || (input.contactType !== null && !isRoommateContactType(input.contactType))
    || (input.contactValue !== null && typeof input.contactValue !== 'string')
    || typeof input.consent !== 'boolean'
  ) {
    throw new ApiResponseError(400);
  }
  return {
    address: {
      campus: input.address.campus,
      building: input.address.building,
      orientation: input.address.orientation,
      room: input.address.room,
    },
    nickname: input.nickname,
    contactType: input.contactType,
    contactValue: input.contactValue,
    consent: input.consent,
  };
}

function projectRoommateRecoveryCredential(
  credential: RoommateRecoveryCredential,
): RoommateRecoveryCredential {
  if (
    !isRecord(credential)
    || typeof credential.registrationId !== 'string'
    || typeof credential.managementCode !== 'string'
  ) {
    throw new ApiResponseError(400);
  }
  return {
    registrationId: credential.registrationId,
    managementCode: credential.managementCode,
  };
}

export async function getRoommateConfig(
  options: RoommateApiOptions = {},
): Promise<RoommateConfig> {
  const response = await roommateFetch('/api/roommates/config', undefined, options);
  const body = await readJson(response);
  if (containsRawSessionToken(body) || !isRoommateConfig(body)) {
    throw new ApiResponseError(response.status);
  }
  return body;
}

export async function createRoommateRegistration(
  input: RoommateRegistrationInput,
  options: RoommateApiOptions = {},
): Promise<RoommateRegistrationResult> {
  const response = await roommateFetch(
    '/api/roommates/registrations',
    jsonRequest('POST', projectRoommateRegistrationInput(input)),
    options,
  );
  const body = await readJson(response);
  if (
    !isRecord(body)
    || containsRawSessionToken(body)
    || typeof body.registrationId !== 'string'
    || (body.managementCode !== null && typeof body.managementCode !== 'string')
    || !isRoommateSelf(body.own)
    || !Array.isArray(body.members)
    || !body.members.every(isRoommateMember)
  ) {
    throw new ApiResponseError(response.status);
  }
  return {
    registrationId: body.registrationId,
    managementCode: body.managementCode as string | null,
    own: body.own,
    members: body.members,
  };
}

export async function getMyRoommateRegistration(
  options: RoommateApiOptions = {},
): Promise<RoommateSelf> {
  const response = await roommateFetch('/api/roommates/me', undefined, options);
  const body = await readJson(response);
  if (!isRecord(body) || containsRawSessionToken(body) || !isRoommateSelf(body.item)) {
    throw new ApiResponseError(response.status);
  }
  return body.item;
}

export async function updateMyRoommateRegistration(
  input: RoommateRegistrationInput,
  options: RoommateApiOptions = {},
): Promise<RoommateSelf> {
  const response = await roommateFetch(
    '/api/roommates/me',
    jsonRequest('PATCH', projectRoommateRegistrationInput(input)),
    options,
  );
  const body = await readJson(response);
  if (!isRecord(body) || containsRawSessionToken(body) || !isRoommateSelf(body.item)) {
    throw new ApiResponseError(response.status);
  }
  return body.item;
}

export async function deleteMyRoommateRegistration(
  options: RoommateApiOptions = {},
): Promise<void> {
  const response = await roommateFetch('/api/roommates/me', { method: 'DELETE' }, options);
  const body = await readJson(response);
  if (!isRecord(body) || containsRawSessionToken(body) || body.status !== 'deleted') {
    throw new ApiResponseError(response.status);
  }
}

export async function recoverRoommateRegistration(
  credential: RoommateRecoveryCredential,
  options: RoommateApiOptions = {},
): Promise<RoommateRecoveryResult> {
  const response = await roommateFetch(
    '/api/roommates/recover',
    jsonRequest('POST', projectRoommateRecoveryCredential(credential)),
    options,
  );
  const body = await readJson(response);
  if (
    !isRecord(body)
    || containsRawSessionToken(body)
    || typeof body.registrationId !== 'string'
    || !isRoommateSelf(body.own)
  ) {
    throw new ApiResponseError(response.status);
  }
  return { registrationId: body.registrationId, own: body.own };
}

export async function listRoommateMembers(
  options: RoommateApiOptions = {},
): Promise<RoommateMember[]> {
  const response = await roommateFetch('/api/roommates/members', undefined, options);
  const body = await readJson(response);
  if (
    !isRecord(body)
    || containsRawSessionToken(body)
    || !Array.isArray(body.items)
    || !body.items.every(isRoommateMember)
  ) {
    throw new ApiResponseError(response.status);
  }
  return body.items;
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
