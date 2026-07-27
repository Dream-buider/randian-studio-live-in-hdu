import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../domain/errors.js';
import type {
  ContentRepository,
  ReviewRepository,
} from '../repositories/contracts.js';
import type { ReviewStatus } from '../domain/models.js';
import { ContentReviewService } from '../services/content-review-service.js';

export interface AnswerRouterContract {
  answer(question: string): Promise<unknown>;
}

export interface AppDependencies {
  config: AppConfig;
  content: ContentRepository;
  reviews: ReviewRepository;
  router: AnswerRouterContract;
}

export function createApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const reviewService = new ContentReviewService(deps.content);

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
    const statusCode = (
      typeof error === 'object'
      && error !== null
      && 'statusCode' in error
      && error.statusCode === 400
    ) ? 400 : 500;
    if (statusCode === 400) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
    }
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  app.get('/api/questions', async () => ({
    items: await reviewService.listPublicQuestions(),
  }));

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

  return app;
}
