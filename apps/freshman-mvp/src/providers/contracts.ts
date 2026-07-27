import type { QuestionIntent, SourceRef } from '../domain/models.js';

export interface IntentClassification {
  intentId: string | null;
  confidence: number;
  reason: string;
}

export interface SearchItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResult {
  available: boolean;
  items: SearchItem[];
}

export interface KnowledgeHit {
  answer: string;
  sources: SourceRef[];
}

export interface SynthesisInput {
  question: string;
  search: SearchResult;
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
  search(question: string): Promise<SearchResult>;
}
