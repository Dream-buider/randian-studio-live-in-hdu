import type {
  CanonicalAnswerVersion,
  PublishedQuestion,
  QuestionIntent,
  RawAnswer,
  SourceRef,
} from '../domain/models.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../domain/errors.js';
import { assertSourceRefs } from '../domain/validation.js';
import type { ContentRepository } from '../repositories/contracts.js';

export interface PublishDraftInput {
  summary: unknown;
  fullAnswer: unknown;
  sources: unknown;
  reviewerId: unknown;
}

export interface IntentWorkspaceItem extends QuestionIntent {
  rawAnswerCount: number;
  publishedAnswer: PublishedQuestion | null;
}

function requiredTrimmedString(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${field} must be a non-blank string`);
  }
  return value.trim();
}

function normalizedSources(value: unknown): SourceRef[] {
  assertSourceRefs(value);
  if (value.length === 0) {
    throw new ValidationError('sources must contain at least one source');
  }
  return value.map((source) => ({
    ...source,
    title: requiredTrimmedString('source title', source.title),
    url: source.url.trim(),
    updatedAt: source.updatedAt === null ? null : source.updatedAt.trim(),
  }));
}

export class ContentReviewService {
  constructor(private readonly content: ContentRepository) {}

  async listPublicQuestions(): Promise<PublishedQuestion[]> {
    return this.content.listPublishedQuestions();
  }

  async listIntentWorkspace(): Promise<IntentWorkspaceItem[]> {
    const [intents, publishedQuestions] = await Promise.all([
      this.content.getIntentCatalog(),
      this.content.listPublishedQuestions(),
    ]);
    const publishedById = new Map(publishedQuestions.map((item) => [item.id, item]));

    return Promise.all(intents.map(async (intent) => ({
      ...intent,
      rawAnswerCount: (await this.content.listRawAnswers(intent.id)).length,
      publishedAnswer: publishedById.get(intent.id) ?? null,
    })));
  }

  async listRawAnswers(intentId: string): Promise<RawAnswer[]> {
    const exists = (await this.content.getIntentCatalog()).some((item) => item.id === intentId);
    if (!exists) {
      throw new NotFoundError('Question intent not found');
    }
    return this.content.listRawAnswers(intentId);
  }

  async publish(
    intentId: string,
    input: PublishDraftInput,
  ): Promise<CanonicalAnswerVersion> {
    const intent = (await this.content.getIntentCatalog()).find((item) => item.id === intentId);
    if (!intent) {
      throw new NotFoundError('Question intent not found');
    }
    if (!intent.active) {
      throw new ConflictError('Inactive question intents cannot be published');
    }
    if (intent.externalId?.trim().toUpperCase() === 'Q11') {
      throw new ConflictError('Reserved Q11 must remain unpublished');
    }

    const summary = requiredTrimmedString('summary', input.summary);
    const summaryLength = Array.from(summary).length;
    if (summaryLength < 20 || summaryLength > 150) {
      throw new ValidationError('summary must contain between 20 and 150 Unicode code points');
    }

    return this.content.publishCanonicalAnswer({
      intentId,
      summary,
      fullAnswer: requiredTrimmedString('fullAnswer', input.fullAnswer),
      sources: normalizedSources(input.sources),
      reviewerId: requiredTrimmedString('reviewerId', input.reviewerId),
    });
  }
}
