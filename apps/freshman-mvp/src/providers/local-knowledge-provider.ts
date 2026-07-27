import type { SourceRef } from '../domain/models.js';
import { bestLocalMatch } from '../services/intent-matcher.js';
import type { KnowledgeHit, KnowledgeProvider } from './contracts.js';

export interface LocalKnowledgeRecord {
  question: string;
  aliases: string[];
  keywords: string[];
  excludeKeywords: string[];
  answer: string;
  sources: SourceRef[];
}

export class LocalKnowledgeProvider implements KnowledgeProvider {
  private readonly records: readonly LocalKnowledgeRecord[];
  private readonly threshold: number;

  constructor(records: readonly LocalKnowledgeRecord[], threshold = 0.5) {
    this.records = records;
    this.threshold = threshold;
  }

  async search(question: string): Promise<KnowledgeHit | null> {
    const match = bestLocalMatch(question, this.records, this.threshold);
    if (!match || match.entry.answer.trim().length === 0) {
      return null;
    }
    return {
      answer: match.entry.answer.trim(),
      sources: match.entry.sources,
    };
  }
}
