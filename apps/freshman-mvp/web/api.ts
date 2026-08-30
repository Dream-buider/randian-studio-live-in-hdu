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
export type RoommateOrientation = 'east' | 'south' | 'west' | 'north' | 'unknown';
export type RoommateBed = '1' | '2' | '3' | '4' | '5';
export type RoommateContactType = 'wechat' | 'qq' | 'phone' | 'other';
export type RoommateRegistrationStatus = 'active' | 'hidden' | 'deleted' | 'expired';

export type RoommateCampusTemplate =
  | {
    code: 'xiasha';
    name: string;
    templateVersion: 'xiasha-v1';
    enabled: true;
    unavailableReason?: string;
  }
  | {
    code: 'shaoxing';
    name: string;
    templateVersion: 'shaoxing-v1';
    enabled: true;
    unavailableReason?: string;
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
  bed?: RoommateBed | null;
}

export interface RoommateAddress extends Omit<RoommateAddressInput, 'bed'> {
  templateVersion: 'xiasha-v1' | 'shaoxing-v1';
  bed: RoommateBed | null;
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
  bed: RoommateBed | null;
  contact: RoommateContact | null;
}

export interface RoommateRecoveryCredential {
  registrationId: string;
  managementCode: string;
}

export interface RoommateAdminItem extends Omit<RoommateSelf, 'contact'> {
  contact: { type: RoommateContactType; masked: true } | null;
  lastModeration: {
    action: 'hide' | 'restore' | 'delete' | 'view_contact';
    actorId: string;
    reason: string;
    createdAt: string;
  } | null;
}

export interface RoommateAdminContactReveal {
  contact: RoommateContact;
  lastModeration: NonNullable<RoommateAdminItem['lastModeration']>;
}

export interface RoommateAdminFilters {
  campus?: RoommateCampusCode;
  status?: RoommateRegistrationStatus;
  building?: string;
  orientation?: RoommateOrientation;
  room?: string;
}

export type RoommateModerationAction = 'hide' | 'restore' | 'delete';

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
    && value.enabled === true
    && value.templateVersion === 'shaoxing-v1';
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

export type RoommateBuildingGroupImageMime = 'image/png' | 'image/jpeg';

export interface AdminRoommateBuildingGroup {
  campus: RoommateCampusCode;
  building: string;
  imageMime: RoommateBuildingGroupImageMime;
  imageSize: number;
  updatedAt: string;
  imageUrl: string;
}

export interface AdminRoommateBuildingGroupUpload {
  mimeType: RoommateBuildingGroupImageMime;
  imageBase64: string;
}

/** UI-only draft shape; blank campus/orientation values never cross the API boundary. */
export interface RoommateRegistrationDraft {
  address: {
    campus: RoommateCampusCode | '';
    building: string;
    orientation: RoommateOrientation | '';
    room: string;
    bed: RoommateBed | null;
  };
  nickname: string;
  contactType: RoommateContactType | null;
  contactValue: string | null;
  consent: boolean;
}

export type RoommateBuildingGroup =
  | {
    campus: RoommateCampusCode;
    building: string;
    available: false;
    message: '该新生楼栋群暂未开放';
  }
  | {
    campus: RoommateCampusCode;
    building: string;
    available: true;
    imageUrl: string;
    updatedAt: string;
  };

function isRoommateBed(value: unknown): value is RoommateBed | null {
  return value === null || (typeof value === 'string' && ['1', '2', '3', '4', '5'].includes(value));
}

function isRoommateAddress(value: unknown): value is RoommateAddress {
  return isRecord(value)
    && ((value.campus === 'xiasha' && value.templateVersion === 'xiasha-v1')
      || (value.campus === 'shaoxing' && value.templateVersion === 'shaoxing-v1'))
    && typeof value.building === 'string'
    && ['east', 'south', 'west', 'north', 'unknown'].includes(value.orientation as string)
    && typeof value.room === 'string'
    && isRoommateBed(value.bed)
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
    && isRoommateBed(value.bed)
    && (value.contact === null || isRoommateContact(value.contact));
}

function canonicalRoommateBuilding(value: string): string | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const normalized = value.trim().replace(/^0+(?=\d)/, '');
  const number = Number(normalized);
  return Number.isInteger(number) && number >= 1 && number <= 40 ? normalized : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function isSafeRoommateBuildingGroupImageUrl(
  value: unknown,
  campus: RoommateCampusCode,
  building: string,
): value is string {
  if (typeof value !== 'string' || !value.startsWith('/api/roommates/building-groups/')) {
    return false;
  }
  if (value.includes('://') || value.includes('\\') || /[?#]/.test(value)) {
    return false;
  }
  return value === `/api/roommates/building-groups/${campus}/${building}/image`;
}

function isRoommateBuildingGroup(
  value: unknown,
  campus: RoommateCampusCode,
  building: string,
): value is RoommateBuildingGroup {
  if (!isRecord(value) || value.campus !== campus || value.building !== building) {
    return false;
  }
  if (value.available === false) {
    return hasExactKeys(value, ['campus', 'building', 'available', 'message'])
      && value.message === '该新生楼栋群暂未开放';
  }
  return value.available === true
    && hasExactKeys(value, ['campus', 'building', 'available', 'imageUrl', 'updatedAt'])
    && isSafeRoommateBuildingGroupImageUrl(value.imageUrl, campus, building)
    && typeof value.updatedAt === 'string';
}

interface AdminRoommateBuildingGroupWire extends AdminRoommateBuildingGroup {
  imageSha256: string;
  updatedBy: string;
}

function isAdminRoommateBuildingGroupWire(value: unknown): value is AdminRoommateBuildingGroupWire {
  if (!isRecord(value) || !hasExactKeys(value, [
    'campus',
    'building',
    'imageMime',
    'imageSha256',
    'imageSize',
    'updatedAt',
    'updatedBy',
    'imageUrl',
  ])) {
    return false;
  }
  if (value.campus !== 'xiasha' && value.campus !== 'shaoxing') return false;
  const building = canonicalRoommateBuilding(String(value.building));
  return building !== null
    && value.building === building
    && (value.imageMime === 'image/png' || value.imageMime === 'image/jpeg')
    && typeof value.imageSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(value.imageSha256)
    && typeof value.imageSize === 'number'
    && Number.isInteger(value.imageSize)
    && value.imageSize > 0
    && value.imageSize <= 1024 * 1024
    && typeof value.updatedAt === 'string'
    && typeof value.updatedBy === 'string'
    && value.imageUrl === `/api/admin/roommate-building-groups/${value.campus}/${building}/image`;
}

function projectAdminRoommateBuildingGroup(
  value: AdminRoommateBuildingGroupWire,
): AdminRoommateBuildingGroup {
  return {
    campus: value.campus,
    building: value.building,
    imageMime: value.imageMime,
    imageSize: value.imageSize,
    updatedAt: value.updatedAt,
    imageUrl: value.imageUrl,
  };
}

function strictBase64DecodedSize(value: string): number | null {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return null;
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function isRoommateAdminItem(value: unknown): value is RoommateAdminItem {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !isRoommateAddress(value.address)
    || typeof value.nickname !== 'string'
    || !isRoommateStatus(value.status)
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string'
    || typeof value.expiresAt !== 'string'
    || (value.deletedAt !== null && typeof value.deletedAt !== 'string')
  ) {
    return false;
  }
  if (value.contact !== null && (
    !isRecord(value.contact)
    || !isRoommateContactType(value.contact.type)
    || value.contact.masked !== true
  )) {
    return false;
  }
  if (value.lastModeration === null) {
    return true;
  }
  return isRecord(value.lastModeration)
    && typeof value.lastModeration.action === 'string'
    && ['hide', 'restore', 'delete', 'view_contact'].includes(value.lastModeration.action)
    && typeof value.lastModeration.actorId === 'string'
    && typeof value.lastModeration.reason === 'string'
    && typeof value.lastModeration.createdAt === 'string';
}

function containsRoommateAdminSecret(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsRoommateAdminSecret);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, nested]) => {
    const normalized = key.toLowerCase();
    return normalized.includes('digest')
      || normalized === 'sessiontoken'
      || normalized === 'managementcode'
      || containsRoommateAdminSecret(nested);
  });
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
    || !['east', 'south', 'west', 'north', 'unknown'].includes(input.address.orientation)
    || typeof input.address.room !== 'string'
    || (input.address.bed !== undefined && !isRoommateBed(input.address.bed))
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
      bed: input.address.bed ?? null,
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

export async function getRoommateBuildingGroup(
  campus: RoommateCampusCode,
  building: string,
  options: RoommateApiOptions = {},
): Promise<RoommateBuildingGroup> {
  if (campus !== 'xiasha' && campus !== 'shaoxing') {
    throw new ApiResponseError(400);
  }
  const canonicalBuilding = canonicalRoommateBuilding(building);
  if (!canonicalBuilding) {
    throw new ApiResponseError(400);
  }
  const response = await roommateFetch(
    `/api/roommates/building-groups/${encodeURIComponent(campus)}/${encodeURIComponent(canonicalBuilding)}`,
    undefined,
    options,
  );
  const body = await readJson(response);
  if (containsRawSessionToken(body) || !isRoommateBuildingGroup(body, campus, canonicalBuilding)) {
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

export async function listAdminRoommateBuildingGroups(): Promise<AdminRoommateBuildingGroup[]> {
  const response = await fetch('/api/admin/roommate-building-groups');
  const body = await readJson(response);
  if (
    !isRecord(body)
    || !hasExactKeys(body, ['items'])
    || !Array.isArray(body.items)
    || !body.items.every(isAdminRoommateBuildingGroupWire)
  ) {
    throw new ApiResponseError(response.status);
  }
  return body.items.map(projectAdminRoommateBuildingGroup);
}

export async function putAdminRoommateBuildingGroup(
  campus: RoommateCampusCode,
  building: string,
  upload: AdminRoommateBuildingGroupUpload,
): Promise<AdminRoommateBuildingGroup> {
  const canonicalBuilding = canonicalRoommateBuilding(building);
  const decodedSize = strictBase64DecodedSize(upload.imageBase64);
  if (
    (campus !== 'xiasha' && campus !== 'shaoxing')
    || !canonicalBuilding
    || (upload.mimeType !== 'image/png' && upload.mimeType !== 'image/jpeg')
    || decodedSize === null
    || decodedSize <= 0
    || decodedSize > 1024 * 1024
  ) {
    throw new ApiResponseError(400);
  }
  const response = await fetch(
    `/api/admin/roommate-building-groups/${campus}/${canonicalBuilding}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mimeType: upload.mimeType, imageBase64: upload.imageBase64 }),
    },
  );
  const body = await readJson(response);
  if (!isAdminRoommateBuildingGroupWire(body)) {
    throw new ApiResponseError(response.status);
  }
  return projectAdminRoommateBuildingGroup(body);
}

export async function deleteAdminRoommateBuildingGroup(
  campus: RoommateCampusCode,
  building: string,
): Promise<'deleted' | 'not_found'> {
  const canonicalBuilding = canonicalRoommateBuilding(building);
  if ((campus !== 'xiasha' && campus !== 'shaoxing') || !canonicalBuilding) {
    throw new ApiResponseError(400);
  }
  const response = await fetch(
    `/api/admin/roommate-building-groups/${campus}/${canonicalBuilding}`,
    { method: 'DELETE' },
  );
  const body = await readJson(response);
  if (
    !isRecord(body)
    || !hasExactKeys(body, ['status'])
    || (body.status !== 'deleted' && body.status !== 'not_found')
  ) {
    throw new ApiResponseError(response.status);
  }
  return body.status;
}

export async function listAdminRoommates(
  filters: RoommateAdminFilters = {},
): Promise<RoommateAdminItem[]> {
  const params = new URLSearchParams();
  if (filters.campus) params.set('campus', filters.campus);
  if (filters.status) params.set('status', filters.status);
  if (filters.building?.trim()) params.set('building', filters.building.trim());
  if (filters.orientation) params.set('orientation', filters.orientation);
  if (filters.room?.trim()) params.set('room', filters.room.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(`/api/admin/roommates${suffix}`);
  const body = await readJson(response);
  if (
    !isRecord(body)
    || containsRoommateAdminSecret(body)
    || !Array.isArray(body.items)
    || !body.items.every(isRoommateAdminItem)
  ) {
    throw new ApiResponseError(response.status);
  }
  return body.items;
}

export async function revealRoommateContact(
  registrationId: string,
  reason: string,
): Promise<RoommateAdminContactReveal> {
  const normalizedReason = reason.trim();
  if (!registrationId.trim() || !normalizedReason) {
    throw new ApiResponseError(400);
  }
  const response = await fetch(
    `/api/admin/roommates/${encodeURIComponent(registrationId)}/reveal-contact`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: normalizedReason }),
    },
  );
  const body = await readJson(response);
  if (
    !isRecord(body)
    || containsRoommateAdminSecret(body)
    || !isRoommateContact(body.contact)
    || !isRecord(body.lastModeration)
    || typeof body.lastModeration.action !== 'string'
    || !['hide', 'restore', 'delete', 'view_contact'].includes(body.lastModeration.action)
    || typeof body.lastModeration.actorId !== 'string'
    || typeof body.lastModeration.reason !== 'string'
    || typeof body.lastModeration.createdAt !== 'string'
  ) {
    throw new ApiResponseError(response.status);
  }
  return {
    contact: body.contact,
    lastModeration: body.lastModeration as RoommateAdminContactReveal['lastModeration'],
  };
}

export async function moderateRoommate(
  registrationId: string,
  action: RoommateModerationAction,
  reason: string,
): Promise<RoommateAdminItem> {
  const normalizedReason = reason.trim();
  if (
    !registrationId.trim()
    || !['hide', 'restore', 'delete'].includes(action)
    || !normalizedReason
  ) {
    throw new ApiResponseError(400);
  }
  const response = await fetch(
    `/api/admin/roommates/${encodeURIComponent(registrationId)}/moderate`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, reason: normalizedReason }),
    },
  );
  const body = await readJson(response);
  if (
    !isRecord(body)
    || containsRoommateAdminSecret(body)
    || !isRoommateAdminItem(body.item)
  ) {
    throw new ApiResponseError(response.status);
  }
  return body.item;
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
