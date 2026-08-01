import type {
  QuestionIntent,
  ReviewProviderStatus,
  ReviewSearchLead,
  SourceRef,
} from '../domain/models.js';

export interface IntentClassification {
  intentId: string | null;
  confidence: number;
  reason: string;
}

export type ProviderStatus = ReviewProviderStatus;

export interface SearchLead extends ReviewSearchLead {}

export interface WebSearchResult {
  status: ProviderStatus;
  leads: SearchLead[];
}

export interface LegacyKnowledgeHit {
  answer: string;
  sources: SourceRef[];
}

export interface KnowledgeHit {
  content: string;
  score: number;
  knowledgeId: string;
  chunkId: string;
  title: string;
  sourceType: string;
  sequence: number;
  source: SourceRef;
}

export interface KnowledgeSearchResult {
  status: ProviderStatus;
  hits: KnowledgeHit[];
}

export type KnowledgeProviderResult =
  | LegacyKnowledgeHit
  | KnowledgeSearchResult
  | null;

export interface SynthesisInput {
  question: string;
  search: WebSearchResult;
}

export interface KnowledgeSynthesisInput {
  question: string;
  hits: KnowledgeHit[];
}

export interface ModelAnswer {
  text: string;
  sources: SourceRef[];
}

export interface ModelProvider {
  classifyIntent(
    question: string,
    intents: QuestionIntent[],
  ): Promise<IntentClassification | null>;
  synthesize(input: SynthesisInput): Promise<ModelAnswer>;
  synthesizeKnowledge?(input: KnowledgeSynthesisInput): Promise<ModelAnswer>;
}

export interface KnowledgeProvider {
  search(question: string): Promise<KnowledgeProviderResult>;
}

export interface SearchProvider {
  search(question: string): Promise<WebSearchResult>;
}
