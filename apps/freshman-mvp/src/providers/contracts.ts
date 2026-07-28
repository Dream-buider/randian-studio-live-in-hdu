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

export interface KnowledgeHit {
  answer: string;
  sources: SourceRef[];
}

export interface SynthesisInput {
  question: string;
  search: WebSearchResult;
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
}

export interface KnowledgeProvider {
  search(question: string): Promise<KnowledgeHit | null>;
}

export interface SearchProvider {
  search(question: string): Promise<WebSearchResult>;
}
