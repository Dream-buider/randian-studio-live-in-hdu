import type { FreshmanGuideChunk } from '../content/freshman-guide-document.js';
import {
  FRESHMAN_GUIDE_ALIASES,
  FRESHMAN_GUIDE_SECTIONS,
} from '../content/freshman-guide.js';
import type {
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeSearchResult,
} from './contracts.js';

const KNOWLEDGE_ID = 'freshman-guide-2026';
const GUIDE_TITLE = '杭电新生指北';
const DEFAULT_MAX_HITS = 8;
const DEFAULT_MINIMUM_SCORE = 0.42;
const GENERIC_TOKENS = [
  '杭州电子科技大学',
  '学校',
  '大学',
  '杭电',
  '怎么办',
  '怎么',
  '什么',
  '情况',
  '可以',
] as const;

export interface FreshmanGuideProviderOptions {
  chunks: readonly FreshmanGuideChunk[];
  maxHits?: number;
  minimumScore?: number;
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function nonGenericQuestion(question: string): string {
  let cleaned = normalize(question);
  for (const token of GENERIC_TOKENS) {
    cleaned = cleaned.replaceAll(token, '');
  }
  return cleaned;
}

function addHanBigrams(value: string, tokens: Set<string>): void {
  for (const segment of value.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (let index = 0; index + 1 < segment.length; index += 1) {
      tokens.add(segment.slice(index, index + 2));
    }
  }
}

const APPROVED_TERMS = new Set([
  ...FRESHMAN_GUIDE_SECTIONS.flatMap((section) => section.headingTerms),
  ...Object.keys(FRESHMAN_GUIDE_ALIASES),
  ...Object.values(FRESHMAN_GUIDE_ALIASES).flat(),
].map(normalize).filter((term) => term.length >= 2));

function tokensFor(question: string): { tokens: readonly string[]; aliasTitles: ReadonlySet<string> } {
  const normalizedQuestion = normalize(question);
  const aliasTitles = new Set<string>();
  for (const [title, aliases] of Object.entries(FRESHMAN_GUIDE_ALIASES)) {
    if (aliases.some((alias) => normalizedQuestion.includes(normalize(alias)))) {
      aliasTitles.add(normalize(title));
    }
  }

  const meaningful = nonGenericQuestion(question);
  if (!meaningful && aliasTitles.size === 0) {
    return { tokens: [], aliasTitles };
  }

  const tokens = new Set<string>();
  for (const term of APPROVED_TERMS) {
    if (meaningful.includes(term)) {
      tokens.add(term);
    }
  }
  addHanBigrams(meaningful, tokens);
  for (const term of meaningful.match(/[a-z0-9]+/gu) ?? []) {
    if (term.length >= 2) {
      tokens.add(term);
    }
  }
  for (const title of aliasTitles) {
    tokens.add(title);
  }

  return { tokens: [...tokens], aliasTitles };
}

function includesAny(text: string, token: string): boolean {
  return token.length >= 2 && text.includes(token);
}

function configuredLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MAX_HITS;
  }
  return Math.max(0, Math.min(Math.trunc(value), DEFAULT_MAX_HITS));
}

function configuredMinimumScore(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MINIMUM_SCORE;
  }
  return Math.max(0, Math.min(value, 1));
}

export class FreshmanGuideProvider implements KnowledgeProvider {
  private readonly chunks: readonly FreshmanGuideChunk[];
  private readonly maxHits: number;
  private readonly minimumScore: number;

  constructor(options: FreshmanGuideProviderOptions) {
    this.chunks = [...options.chunks];
    this.maxHits = configuredLimit(options.maxHits);
    this.minimumScore = configuredMinimumScore(options.minimumScore);
  }

  status(): { status: 'available' | 'not-configured' | 'configuration-error'; chunks: number } {
    return {
      status: this.chunks.length === 0 ? 'not-configured' : 'available',
      chunks: this.chunks.length,
    };
  }

  async search(question: string): Promise<KnowledgeSearchResult> {
    const providerStatus = this.status().status;
    if (providerStatus !== 'available') {
      return { status: providerStatus, hits: [] };
    }

    const { tokens, aliasTitles } = tokensFor(question);
    if (tokens.length === 0) {
      return { status: 'available', hits: [] };
    }

    const hits = this.chunks
      .map((chunk): KnowledgeHit | null => {
        const displayTitle = normalize(chunk.displayTitle);
        const titlePath = chunk.titlePath.map(normalize);
        const content = normalize(chunk.content);
        let score = aliasTitles.has(displayTitle) ? 1 : 0;

        for (const token of tokens) {
          if (includesAny(displayTitle, token)) {
            score += 0.45;
          }
          if (titlePath.some((heading) => includesAny(heading, token))) {
            score += 0.30;
          }
          if (includesAny(content, token)) {
            score += 0.08;
          }
        }
        score = Math.min(score, 1);
        if (score < this.minimumScore) {
          return null;
        }
        return {
          content: chunk.content,
          score,
          knowledgeId: KNOWLEDGE_ID,
          chunkId: chunk.id,
          title: GUIDE_TITLE,
          sourceType: 'community',
          sequence: chunk.sequence,
          source: chunk.source,
        };
      })
      .filter((hit): hit is KnowledgeHit => hit !== null)
      .sort((left, right) => right.score - left.score || left.sequence - right.sequence)
      .slice(0, this.maxHits);

    return { status: 'available', hits };
  }
}
