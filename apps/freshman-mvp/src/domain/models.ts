export type TrustStatus = 'approved' | 'knowledge' | 'web-unverified';
export type AnswerStatus = 'draft' | 'pending' | 'published' | 'needs_update' | 'disabled';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_more';
export type ReviewRiskLevel = 'low' | 'medium' | 'high';

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

export interface QuestionIntent {
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
}

export interface RawAnswer {
  id: string;
  intentId: string;
  answer: string;
  sourceLabel: string;
  sourceCell: string;
  createdAt: string;
}

export interface CanonicalAnswerVersion {
  id: string;
  intentId: string;
  version: number;
  summary: string;
  fullAnswer: string;
  sources: SourceRef[];
  status: AnswerStatus;
  reviewerId: string;
  publishedAt: string | null;
  updatedAt: string;
}

export interface ReviewTask {
  id: string;
  question: string;
  answer: string;
  sources: SourceRef[];
  riskLevel: ReviewRiskLevel;
  status: ReviewStatus;
  ordinal: number;
  createdAt: string;
  decidedAt: string | null;
  reviewerId: string | null;
  decisionNote: string | null;
}

export interface QuestionContext {
  intentId: string | null;
  question: string;
  category: string | null;
}

export type AnswerResult =
  | { route: 'preset'; trustStatus: 'approved'; answer: string; sources: SourceRef[]; intentId: string }
  | { route: 'knowledge'; trustStatus: 'knowledge'; answer: string; sources: SourceRef[] }
  | { route: 'web'; trustStatus: 'web-unverified'; answer: string; sources: SourceRef[]; disclaimer: string; reviewOrdinal: number };
