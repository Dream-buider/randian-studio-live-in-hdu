import type {
  CanonicalAnswerVersion,
  QuestionIntent,
  RawAnswer,
  ReviewStatus,
  ReviewTask,
  SourceRef,
  PublishedQuestion,
} from '../domain/models.js';

export interface PublishCanonicalAnswerInput {
  intentId: string;
  summary: string;
  fullAnswer: string;
  sources: SourceRef[];
  reviewerId: string;
}

export interface EnqueueReviewInput {
  question: string;
  answer: string;
  sources: SourceRef[];
}

export interface ReviewDecision {
  status: Exclude<ReviewStatus, 'pending'>;
  reviewerId: string;
  note: string;
}

export interface ContentRepository {
  createIntent(input: QuestionIntent): Promise<void>;
  upsertRawAnswers(items: RawAnswer[]): Promise<number>;
  listPublishedQuestions(): Promise<PublishedQuestion[]>;
  getIntentCatalog(): Promise<QuestionIntent[]>;
  publishCanonicalAnswer(input: PublishCanonicalAnswerInput): Promise<CanonicalAnswerVersion>;
  listRawAnswers(intentId: string): Promise<RawAnswer[]>;
}

export interface ReviewRepository {
  enqueue(input: EnqueueReviewInput): Promise<ReviewTask>;
  list(status?: ReviewStatus): Promise<ReviewTask[]>;
  decide(id: string, decision: ReviewDecision): Promise<ReviewTask>;
}
