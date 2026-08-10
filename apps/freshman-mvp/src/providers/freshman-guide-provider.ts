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
  '在哪里',
  '怎么走',
  '如何去',
  '如何到',
  '有多大',
  '学校',
  '大学',
  '杭电',
  '在哪',
  '哪里',
  '位置',
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
  for (const token of [...GENERIC_TOKENS].sort((left, right) => right.length - left.length)) {
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

function tokensFor(question: string): {
  tokens: readonly string[];
  aliasTitles: ReadonlySet<string>;
  meaningful: string;
} {
  const normalizedQuestion = normalize(question);
  const aliasTitles = new Set<string>();
  for (const [title, aliases] of Object.entries(FRESHMAN_GUIDE_ALIASES)) {
    if (aliases.some((alias) => normalizedQuestion.includes(normalize(alias)))) {
      aliasTitles.add(normalize(title));
    }
  }

  const meaningful = nonGenericQuestion(question);
  if (!meaningful && aliasTitles.size === 0) {
    return { tokens: [], aliasTitles, meaningful };
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

  return { tokens: [...tokens], aliasTitles, meaningful };
}

function includesAny(text: string, token: string): boolean {
  return token.length >= 2 && text.includes(token);
}

function maximalTokens(tokens: readonly string[]): readonly string[] {
  return tokens.filter((token) => (
    !tokens.some((candidate) => candidate !== token && candidate.includes(token))
  ));
}

function queryCoverage(question: string, tokens: readonly string[]): number {
  if (question.length === 0) {
    return 0;
  }
  const covered = new Set<number>();
  for (const token of tokens) {
    let offset = question.indexOf(token);
    while (offset >= 0) {
      for (let index = offset; index < offset + token.length; index += 1) {
        covered.add(index);
      }
      offset = question.indexOf(token, offset + 1);
    }
  }
  return covered.size / question.length;
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

    const { tokens, aliasTitles, meaningful } = tokensFor(question);
    if (tokens.length === 0) {
      return { status: 'available', hits: [] };
    }

    const aliasCandidateIds = new Set<string>();
    for (const aliasTitle of aliasTitles) {
      const exactChunks = this.chunks.filter((chunk) => (
        normalize(chunk.displayTitle) === aliasTitle
      ));
      if (exactChunks.length > 0) {
        for (const chunk of exactChunks) {
          aliasCandidateIds.add(chunk.id);
        }
        continue;
      }
      for (const chunk of this.chunks) {
        if (chunk.titlePath.map(normalize).some((heading) => heading.includes(aliasTitle))) {
          aliasCandidateIds.add(chunk.id);
        }
      }
    }
    const candidateChunks = aliasTitles.size > 0
      ? this.chunks.filter((chunk) => aliasCandidateIds.has(chunk.id))
      : this.chunks;

    const hits = candidateChunks
      .map((chunk): KnowledgeHit | null => {
        const displayTitle = normalize(chunk.displayTitle);
        const titlePath = chunk.titlePath.map(normalize);
        const content = normalize(chunk.content);
        const aliasTitleMatch = aliasTitles.has(displayTitle)
          || titlePath.some((heading) => (
            [...aliasTitles].some((aliasTitle) => heading.includes(aliasTitle))
          ));
        if (aliasTitleMatch) {
          return {
            content: chunk.content,
            score: 1,
            knowledgeId: KNOWLEDGE_ID,
            chunkId: chunk.id,
            title: GUIDE_TITLE,
            sourceType: 'community',
            sequence: chunk.sequence,
            source: chunk.source,
          };
        }

        const matchedTokens = maximalTokens(tokens.filter((token) => (
          includesAny(displayTitle, token)
          || titlePath.some((heading) => includesAny(heading, token))
          || includesAny(content, token)
        )));
        const coverage = queryCoverage(meaningful, matchedTokens);
        const hasEnoughIndependentEvidence = matchedTokens.length >= 2 && coverage >= 0.45;
        const hasSufficientSingleCoverage = matchedTokens.length === 1 && coverage >= 0.60;
        if (!hasEnoughIndependentEvidence && !hasSufficientSingleCoverage) {
          return null;
        }

        let score = coverage * 0.5;
        for (const token of matchedTokens) {
          const bestFieldScore = includesAny(displayTitle, token)
            ? 0.45
            : titlePath.some((heading) => includesAny(heading, token))
              ? 0.30
              : 0.08;
          score += bestFieldScore;
        }
        score = Math.min(score, 0.99);
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
