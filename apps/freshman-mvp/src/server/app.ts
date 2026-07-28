import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { BlockList, isIP } from 'node:net';
import type { AppConfig } from './config.js';
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../domain/errors.js';
import type {
  ContentRepository,
  ReviewDecision,
  ReviewRepository,
} from '../repositories/contracts.js';
import type { ReviewStatus } from '../domain/models.js';
import { ContentReviewService } from '../services/content-review-service.js';
import type { FaqSyncService } from '../services/faq-sync-service.js';

export interface AnswerRouterContract {
  answer(question: string): Promise<unknown>;
}

export interface AppDependencies {
  config: AppConfig;
  content: ContentRepository;
  reviews: ReviewRepository;
  router: AnswerRouterContract;
  health?: () => Promise<unknown>;
  publicDir?: string;
  faqSync?: Pick<FaqSyncService, 'retry'>;
}

const LOOPBACK_ADDRESSES = new BlockList();
LOOPBACK_ADDRESSES.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK_ADDRESSES.addAddress('::1', 'ipv6');
LOOPBACK_ADDRESSES.addSubnet('::ffff:127.0.0.0', 104, 'ipv6');

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
  const app = Fastify({ logger: false });
  const reviewService = new ContentReviewService(deps.content);

  if (deps.publicDir) {
    void app.register(fastifyStatic, {
      root: deps.publicDir,
      wildcard: false,
    });
    for (const route of ['/chat', '/admin']) {
      app.get(route, (_request, reply) => reply.type('text/html').sendFile('index.html'));
    }
  }

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.raw.url?.split('?', 1)[0] ?? '';
    const isLocalOnlyRoute = pathname === '/api/reviews'
      || pathname.startsWith('/api/reviews/')
      || pathname === '/api/admin'
      || pathname.startsWith('/api/admin/');
    if (isLocalOnlyRoute && !isLoopbackAddress(request.ip)) {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Local access only' },
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
  }>('/api/reviews/:id/decision', async (request) => ({
    item: await deps.reviews.decide(
      request.params.id,
      parseReviewDecision(request.body),
    ),
  }));

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
