import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import { BlockList, isIP } from 'node:net';
import type { AppConfig } from './config.js';
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../domain/errors.js';
import type {
  ApprovedReviewPublisher,
  ContentRepository,
  ReviewDecision,
  ReviewRepository,
} from '../repositories/contracts.js';
import type { ReviewStatus } from '../domain/models.js';
import { ContentReviewService } from '../services/content-review-service.js';
import type { FaqSyncService } from '../services/faq-sync-service.js';
import type { KnowledgeImportStore } from '../services/knowledge-import-service.js';
import type { RoommateService } from '../roommates/service.js';
import type {
  RoommateCreateInput,
  RoommateModerationInput,
} from '../roommates/service.js';
import { listCampusTemplates } from '../roommates/address-templates.js';
import type {
  BedNumber,
  ContactType,
  RoomOrientation,
  RoommateStatus,
} from '../roommates/models.js';

export interface AnswerRouterContract {
  answer(question: string): Promise<unknown>;
}

export interface AppDependencies {
  config: AppConfig;
  content: ContentRepository;
  reviews: ReviewRepository;
  approvedReviewPublisher?: ApprovedReviewPublisher;
  router: AnswerRouterContract;
  health?: () => Promise<unknown>;
  publicDir?: string;
  faqSync?: Pick<FaqSyncService, 'retry'>;
  knowledgeImports?: Pick<KnowledgeImportStore, 'list'>;
  knowledgeImportRetry?: {
    retry(id: string): Promise<unknown>;
  };
  roommates?: RoommateService;
}

const LOOPBACK_ADDRESSES = new BlockList();
LOOPBACK_ADDRESSES.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK_ADDRESSES.addAddress('::1', 'ipv6');
LOOPBACK_ADDRESSES.addSubnet('::ffff:127.0.0.0', 104, 'ipv6');

const ROOMMATE_COOKIE = 'live_in_hdu_roommate';
const ROOMMATE_COOKIE_PATH = '/api/roommates';
const ROOMMATE_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

function isLoopbackAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return LOOPBACK_ADDRESSES.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function clientErrorStatus(error: unknown): number | null {
  if (
    typeof error !== 'object'
    || error === null
    || !('statusCode' in error)
    || typeof error.statusCode !== 'number'
    || !Number.isInteger(error.statusCode)
    || error.statusCode < 400
    || error.statusCode > 499
  ) {
    return null;
  }
  return error.statusCode;
}

function requiredTrimmedString(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-blank string`);
  }
  return value.trim();
}

function boundedString(field: string, value: unknown, maxCodePoints: number): string {
  const normalized = requiredTrimmedString(field, value);
  if (/\p{Cc}/u.test(normalized) || [...normalized].length > maxCodePoints) {
    throw new ValidationError(`${field} is invalid`);
  }
  return normalized;
}

function exactObject(value: unknown, allowedKeys: readonly string[], label = 'body'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const body = value as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new ValidationError(`${label} contains unsupported fields`);
  }
  return body;
}

function parseRoommateInput(value: unknown): RoommateCreateInput {
  const body = exactObject(
    value,
    ['address', 'nickname', 'contactType', 'contactValue', 'consent'],
  );
  const address = exactObject(body.address, ['campus', 'building', 'orientation', 'room', 'bed'], 'address');
  const campus = boundedString('campus', address.campus, 16);
  const orientation = boundedString('orientation', address.orientation, 16);
  if (campus !== 'xiasha' && campus !== 'shaoxing') {
    throw new ValidationError('campus is invalid');
  }
  if (!['east', 'south', 'west', 'north', 'unknown'].includes(orientation)) {
    throw new ValidationError('orientation is invalid');
  }
  const bed = address.bed === undefined ? null : address.bed;
  if (bed !== null && (typeof bed !== 'string' || !['1', '2', '3', '4', '5'].includes(bed))) {
    throw new ValidationError('bed is invalid');
  }
  const contactType = body.contactType;
  if (
    contactType !== null
    && (
      typeof contactType !== 'string'
      || !['wechat', 'qq', 'phone', 'other'].includes(contactType)
    )
  ) {
    throw new ValidationError('contactType is invalid');
  }
  const contactValue = body.contactValue === null
    ? null
    : boundedString('contactValue', body.contactValue, 100);
  if (typeof body.consent !== 'boolean') {
    throw new ValidationError('consent must be a boolean');
  }
  const building = boundedString('building', address.building, 20);
  if (/^\d+$/.test(building) && Number(building.replace(/^0+(?=\d)/, '')) > 40) {
    throw new ValidationError('楼栋必须在1-40号之间');
  }
  return {
    address: {
      campus,
      building,
      orientation: orientation as RoomOrientation,
      room: boundedString('room', address.room, 20),
      bed: bed as BedNumber | null,
    },
    nickname: boundedString('nickname', body.nickname, 30),
    contactType: contactType as ContactType | null,
    contactValue,
    consent: body.consent,
  };
}

function parseRecovery(value: unknown): { registrationId: string; managementCode: string } {
  const body = exactObject(value, ['registrationId', 'managementCode']);
  return {
    registrationId: boundedString('registrationId', body.registrationId, 128),
    managementCode: boundedString('managementCode', body.managementCode, 128),
  };
}

function parseReason(value: unknown): string {
  const body = exactObject(value, ['reason']);
  return boundedString('reason', body.reason, 200);
}

function parseModeration(value: unknown): Pick<RoommateModerationInput, 'action' | 'reason'> {
  const body = exactObject(value, ['action', 'reason']);
  if (
    typeof body.action !== 'string'
    || !['hide', 'restore', 'delete'].includes(body.action)
  ) {
    throw new ValidationError('action is invalid');
  }
  return {
    action: body.action as RoommateModerationInput['action'],
    reason: boundedString('reason', body.reason, 200),
  };
}

function normalizeAdminBuilding(value: unknown): string {
  const normalized = boundedString('building', value, 20);
  if (!/^\d+$/.test(normalized)) {
    throw new ValidationError('building is invalid');
  }
  const canonical = normalized.replace(/^0+(?=\d)/, '');
  if (Number(canonical) <= 0) {
    throw new ValidationError('building is invalid');
  }
  if (Number(canonical) > 40) {
    throw new ValidationError('building is invalid');
  }
  return canonical;
}

function normalizeAdminRoom(value: unknown): string {
  const normalized = boundedString('room', value, 10);
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    throw new ValidationError('room is invalid');
  }
  return /^\d+$/.test(normalized)
    ? normalized.replace(/^0+(?=\d)/, '')
    : normalized;
}

const SAFE_ROOMMATE_VALIDATION_ERRORS = new Set([
  '楼栋格式无效',
  '楼栋必须为正数',
  '楼栋必须在1-40号之间',
  '房间号格式无效',
  '寝室分配规则确认中，暂未开放匹配',
  '校区不支持',
  '朝向不支持',
  'bed is invalid',
  '床位必须为1-5号',
  'Nickname must contain 1-30 Unicode code points without controls',
  'Contact type and value must be provided together',
  'Contact type is invalid',
  'Contact value is invalid',
  'Contact consent is required',
  'Invalid moderation action',
  'Admin reason is required',
]);

const SAFE_ROOMMATE_CONFLICT_ERRORS = new Set([
  'Contact already has an active registration',
  'Concurrent registration change',
  'Only active registrations can be hidden',
  'Only hidden registrations can be restored',
  'Expired registrations cannot be restored',
  'Registration cannot be deleted',
  'Bed already occupied',
]);

function translateRoommateError(error: unknown): never {
  if (
    error instanceof ValidationError
    || error instanceof ConflictError
    || error instanceof NotFoundError
    || error instanceof ServiceUnavailableError
  ) {
    throw error;
  }
  const message = error instanceof Error ? error.message : 'Roommate request failed';
  if (
    message === 'Invalid or expired session'
    || message === 'Registration or management code invalid'
    || message === 'Registration not found'
    || message === 'Contact unavailable'
  ) {
    throw new NotFoundError(message);
  }
  if (SAFE_ROOMMATE_CONFLICT_ERRORS.has(message)) {
    throw new ConflictError(message);
  }
  if (SAFE_ROOMMATE_VALIDATION_ERRORS.has(message)) {
    throw new ValidationError(message);
  }
  if (message === 'Rate limit exceeded' || message === 'Rate limit capacity exceeded') {
    throw Object.assign(new Error('Roommate request rate limited'), { statusCode: 429 });
  }
  throw error instanceof Error ? error : new Error('Unknown roommate service failure');
}

async function callRoommates<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return translateRoommateError(error);
  }
}

function parseReviewDecision(value: unknown): ReviewDecision {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('decision must be an object');
  }
  const body = value as Record<string, unknown>;
  if (!['approved', 'rejected', 'needs_more'].includes(String(body.status))) {
    throw new ValidationError('status is invalid');
  }
  const status = body.status as ReviewDecision['status'];
  const reviewedAnswer = typeof body.reviewedAnswer === 'string'
    ? body.reviewedAnswer.trim()
    : null;
  if (
    (status === 'approved' || status === 'needs_more')
    && (reviewedAnswer === null || reviewedAnswer.length === 0)
  ) {
    throw new ValidationError('reviewedAnswer is required for this decision');
  }
  return {
    status,
    reviewerId: requiredTrimmedString('reviewerId', body.reviewerId),
    note: requiredTrimmedString('note', body.note),
    reviewedAnswer: reviewedAnswer && reviewedAnswer.length > 0 ? reviewedAnswer : null,
    feedbackTarget: requiredTrimmedString('feedbackTarget', body.feedbackTarget),
  };
}

export function createApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: false,
    trustProxy: (address) => isLoopbackAddress(address),
  });
  const reviewService = new ContentReviewService(deps.content);

  const cookieSecret = deps.config.roommate?.cookieSecret ?? undefined;
  void app.register(fastifyCookie, cookieSecret
    ? { secret: cookieSecret, hook: 'onRequest' }
    : { hook: 'onRequest' });

  const cookieOptions = {
    path: ROOMMATE_COOKIE_PATH,
    maxAge: ROOMMATE_COOKIE_MAX_AGE_SECONDS,
    secure: true,
    httpOnly: true,
    sameSite: 'strict' as const,
    signed: true,
  };

  const requireRoommateSession = (request: FastifyRequest, required: boolean): string | undefined => {
    const raw = request.cookies[ROOMMATE_COOKIE];
    if (raw === undefined) {
      if (required) {
        throw new NotFoundError('Invalid or expired session');
      }
      return undefined;
    }
    if (!cookieSecret) {
      throw new ServiceUnavailableError('Roommate session verification is unavailable');
    }
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) {
      throw new NotFoundError('Invalid or expired session');
    }
    return unsigned.value;
  };

  const setRoommateCookie = (reply: FastifyReply, token: string): void => {
    reply.setCookie(ROOMMATE_COOKIE, token, cookieOptions);
  };

  const clearRoommateCookie = (reply: FastifyReply): void => {
    reply.clearCookie(ROOMMATE_COOKIE, {
      ...cookieOptions,
      maxAge: 0,
    });
  };

  if (deps.publicDir) {
    void app.register(fastifyStatic, {
      root: deps.publicDir,
      wildcard: false,
    });
    for (const route of ['/questions', '/chat', '/admin', '/guide', '/roommates']) {
      app.get(route, (_request, reply) => reply.type('text/html').sendFile('index.html'));
    }
  }

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.raw.url?.split('?', 1)[0] ?? '';
    const isLocalOnlyRoute = pathname === '/api/reviews'
      || pathname.startsWith('/api/reviews/')
      || pathname === '/api/admin'
      || pathname.startsWith('/api/admin/');
    const socketAddress = request.raw.socket.remoteAddress ?? '';
    if (
      isLocalOnlyRoute
      && (!isLoopbackAddress(socketAddress) || !isLoopbackAddress(request.ip))
    ) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Local access only' },
      });
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    const pathname = request.raw.url?.split('?', 1)[0] ?? '';
    const isSensitiveRoommateRoute = pathname.startsWith('/api/roommates/')
      && pathname !== '/api/roommates/config';
    if (!isSensitiveRoommateRoute) {
      return;
    }
    if (!deps.roommates) {
      return reply.code(503).send({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Roommate matching is unavailable' },
      });
    }
    if (request.protocol !== 'https') {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'HTTPS is required' },
      });
    }
  });

  app.setNotFoundHandler((_request, reply) => (
    reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  ));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    if (error instanceof ConflictError) {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: error.message },
      });
    }
    if (error instanceof ServiceUnavailableError) {
      return reply.code(503).send({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Answer service is temporarily unavailable',
        },
      });
    }
    const statusCode = clientErrorStatus(error);
    if (statusCode === 400) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
    }
    if (statusCode !== null) {
      return reply.code(statusCode).send({
        error: { code: 'CLIENT_ERROR', message: 'Request could not be processed' },
      });
    }
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  app.get('/api/questions', async () => ({
    items: await reviewService.listPublicQuestions(),
  }));

  app.get('/api/health', async () => (
    deps.health ? deps.health() : { status: 'ok' }
  ));

  app.get('/api/roommates/config', async (request) => ({
    enabled: Boolean(
      deps.roommates
      && deps.config.roommate?.secure
      && request.protocol === 'https'
    ),
    retentionDays: 90,
    campuses: listCampusTemplates(),
  }));

  app.post<{ Body: unknown }>('/api/roommates/registrations', async (request, reply) => {
    const roommates = deps.roommates!;
    const sessionToken = requireRoommateSession(request, false);
    const result = await callRoommates(() => roommates.create(
      parseRoommateInput(request.body),
      { ip: request.ip, ...(sessionToken ? { sessionToken } : {}) },
    ));
    setRoommateCookie(reply, result.sessionToken);
    const { sessionToken: _secret, ...publicResult } = result;
    return publicResult;
  });

  app.get('/api/roommates/me', async (request) => ({
    item: await callRoommates(() => deps.roommates!.getMine(
      requireRoommateSession(request, true)!,
      { ip: request.ip },
    )),
  }));

  app.patch<{ Body: unknown }>('/api/roommates/me', async (request) => ({
    item: await callRoommates(() => deps.roommates!.updateMine(
      requireRoommateSession(request, true)!,
      parseRoommateInput(request.body),
      { ip: request.ip },
    )),
  }));

  app.delete('/api/roommates/me', async (request, reply) => {
    await callRoommates(() => deps.roommates!.deleteMine(
      requireRoommateSession(request, true)!,
      { ip: request.ip },
    ));
    clearRoommateCookie(reply);
    return { status: 'deleted' };
  });

  app.post<{ Body: unknown }>('/api/roommates/recover', async (request, reply) => {
    const input = parseRecovery(request.body);
    const result = await callRoommates(() => deps.roommates!.recover(
      input.registrationId,
      input.managementCode,
      { ip: request.ip },
    ));
    setRoommateCookie(reply, result.sessionToken);
    const { sessionToken: _secret, ...publicResult } = result;
    return publicResult;
  });

  app.get('/api/roommates/members', async (request) => ({
    items: await callRoommates(() => deps.roommates!.listMembers(
      requireRoommateSession(request, true)!,
      { ip: request.ip },
    )),
  }));

  app.get<{
    Querystring: {
      campus?: string;
      status?: string;
      building?: string;
      orientation?: string;
      room?: string;
    };
  }>('/api/admin/roommates', async (request) => {
    const { campus, status, building, orientation, room } = request.query;
    if (status !== undefined && !['active', 'hidden', 'deleted', 'expired'].includes(status)) {
      throw new ValidationError('status is invalid');
    }
    if (campus !== undefined && !['xiasha', 'shaoxing'].includes(campus)) {
      throw new ValidationError('campus is invalid');
    }
    if (orientation !== undefined && !['east', 'south', 'west', 'north', 'unknown'].includes(orientation)) {
      throw new ValidationError('orientation is invalid');
    }
    const normalizedBuilding = building === undefined ? undefined : normalizeAdminBuilding(building);
    const normalizedRoom = room === undefined ? undefined : normalizeAdminRoom(room);
    const items = await callRoommates(() => deps.roommates
      ? deps.roommates.listAdmin('local-admin', 'list-roommates', status as RoommateStatus | undefined)
      : Promise.reject(new ServiceUnavailableError('Roommate matching is unavailable')));
    return {
      items: items.filter((item) => (
        (campus === undefined || item.address.campus === campus)
        && (normalizedBuilding === undefined || item.address.building === normalizedBuilding)
        && (orientation === undefined || item.address.orientation === orientation)
        && (normalizedRoom === undefined || item.address.room === normalizedRoom)
      )),
    };
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/admin/roommates/:id/reveal-contact',
    async (request) => callRoommates(() => deps.roommates
        ? deps.roommates.revealAdminContact(
            boundedString('id', request.params.id, 128),
            'local-admin',
            parseReason(request.body),
          )
        : Promise.reject(new ServiceUnavailableError('Roommate matching is unavailable'))),
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/admin/roommates/:id/moderate',
    async (request) => {
      const input = parseModeration(request.body);
      return {
        item: await callRoommates(() => deps.roommates
          ? deps.roommates.moderate(boundedString('id', request.params.id, 128), {
              ...input,
              actorId: 'local-admin',
            })
          : Promise.reject(new ServiceUnavailableError('Roommate matching is unavailable'))),
      };
    },
  );

  app.post<{
    Body: unknown;
  }>('/api/ask', async (request) => {
    const question = typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>).question
      : undefined;
    if (typeof question !== 'string' || question.trim().length === 0) {
      throw new ValidationError('question must be a non-blank string');
    }
    return deps.router.answer(question.trim());
  });

  app.get('/api/admin/intents', async () => ({
    items: await reviewService.listIntentWorkspace(),
  }));

  app.get('/api/admin/knowledge-imports', async () => ({
    configured: Boolean(deps.knowledgeImports),
    items: deps.knowledgeImports ? await deps.knowledgeImports.list() : [],
  }));

  app.post<{
    Params: { id: string };
  }>('/api/admin/knowledge-imports/:id/retry', async (request) => {
    if (!deps.knowledgeImportRetry) {
      throw new ServiceUnavailableError('Knowledge import retry is not configured');
    }
    return {
      status: 'queued',
      item: await deps.knowledgeImportRetry.retry(request.params.id),
    };
  });

  app.get<{
    Params: { id: string };
  }>('/api/admin/intents/:id/raw-answers', async (request) => ({
    items: await reviewService.listRawAnswers(request.params.id),
  }));

  app.post<{
    Params: { id: string };
    Body: unknown;
  }>('/api/admin/intents/:id/publish', async (request) => (
    reviewService.publish(request.params.id, {
      summary: typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>).summary
        : undefined,
      fullAnswer: typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>).fullAnswer
        : undefined,
      sources: typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>).sources
        : undefined,
      reviewerId: typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>).reviewerId
        : undefined,
    })
  ));

  app.get<{
    Querystring: { status?: string };
  }>('/api/reviews', async (request) => {
    const status = request.query.status;
    const allowed = new Set<ReviewStatus>(['pending', 'approved', 'rejected', 'needs_more']);
    if (status !== undefined && !allowed.has(status as ReviewStatus)) {
      throw new ValidationError('status is invalid');
    }
    return {
      items: await deps.reviews.list(status as ReviewStatus | undefined),
    };
  });

  app.post<{
    Params: { id: string };
    Body: unknown;
  }>('/api/reviews/:id/decision', async (request) => {
    const decision = parseReviewDecision(request.body);
    if (decision.status === 'approved') {
      if (!deps.approvedReviewPublisher) {
        throw new ServiceUnavailableError('Approved review publication is not configured');
      }
      const result = await deps.approvedReviewPublisher.publish(request.params.id, decision);
      return {
        item: result.review,
        publication: {
          intentId: result.intentId,
          version: result.version,
          createdIntent: result.createdIntent,
        },
      };
    }
    return {
      item: await deps.reviews.decide(request.params.id, decision),
    };
  });

  app.post<{
    Params: { id: string };
  }>('/api/admin/integrations/faq/:id/retry', async (request) => {
    if (!deps.faqSync) {
      throw new ServiceUnavailableError('FAQ synchronization is not configured');
    }
    await deps.faqSync.retry(request.params.id);
    return { status: 'queued' };
  });

  return app;
}
