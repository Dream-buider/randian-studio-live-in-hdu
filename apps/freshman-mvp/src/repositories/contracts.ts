import type {
  CanonicalAnswerVersion,
  QuestionIntent,
  RawAnswer,
  ReviewStatus,
  ReviewTask,
  SourceRef,
  PublishedQuestion,
  ReviewProviderStatus,
  ReviewSearchLead,
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
  providerStatus?: ReviewProviderStatus | null;
  rawSearchLeads?: ReviewSearchLead[];
}

export interface ReviewDecision {
  status: Exclude<ReviewStatus, 'pending'>;
  reviewerId: string;
  note: string;
  reviewedAnswer: string | null;
  feedbackTarget: string | null;
}

export interface ApprovedReviewPublicationResult {
  review: ReviewTask;
  intentId: string;
  version: number;
  createdIntent: boolean;
}

export interface ApprovedReviewPublisher {
  publish(
    reviewId: string,
    decision: ReviewDecision,
  ): Promise<ApprovedReviewPublicationResult>;
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
