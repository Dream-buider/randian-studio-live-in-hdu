import type {
  PublishedQuestion,
  QuestionIntent,
} from '../domain/models.js';
import type { ModelProvider } from '../providers/contracts.js';

interface Matchable {
  question: string;
  aliases: string[];
  keywords: string[];
  excludeKeywords: string[];
}

export interface LocalMatch<T> {
  entry: T;
  score: number;
}

export function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function bigrams(value: string): Set<string> {
  const text = normalizeText(value);
  if (text.length < 2) return new Set(text ? [text] : []);
  const result = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) {
    result.add(text.slice(index, index + 2));
  }
  return result;
}

function dice(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const item of a) {
    if (b.has(item)) common += 1;
  }
  return (2 * common) / (a.size + b.size);
}

function scoreEntry(question: string, entry: Matchable): number {
  const normalizedQuestion = normalizeText(question);
  const excluded = entry.excludeKeywords
    .map(normalizeText)
    .filter(Boolean)
    .some((keyword) => normalizedQuestion.includes(keyword));
  if (excluded) return 0;

  let similarity = 0;
  for (const candidate of [entry.question, ...entry.aliases].filter(Boolean)) {
    const normalizedCandidate = normalizeText(candidate);
    if (normalizedQuestion === normalizedCandidate) return 1;
    const containment = normalizedQuestion.includes(normalizedCandidate)
      || normalizedCandidate.includes(normalizedQuestion);
    similarity = Math.max(
      similarity,
      dice(question, candidate) + (containment ? 0.16 : 0),
    );
  }

  const keywords = entry.keywords.map(normalizeText).filter(Boolean);
  const matched = keywords.filter((keyword) => normalizedQuestion.includes(keyword)).length;
  const keywordScore = keywords.length > 0
    ? matched / Math.min(keywords.length, 3)
    : 0;
  return Math.min(0.76 * similarity + 0.24 * keywordScore, 1);
}

export function bestLocalMatch<T extends Matchable>(
  question: string,
  entries: readonly T[],
  threshold = 0.5,
): LocalMatch<T> | null {
  let best: LocalMatch<T> | null = null;
  for (const entry of entries) {
    const score = scoreEntry(question, entry);
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }
  return best && best.score >= threshold ? best : null;
}

export class IntentMatcher {
  private readonly model: ModelProvider;
  private readonly modelConfidenceThreshold: number;
  private readonly localThreshold: number;

  constructor(
    model: ModelProvider,
    modelConfidenceThreshold = 0.7,
    localThreshold = 0.5,
  ) {
    this.model = model;
    this.modelConfidenceThreshold = modelConfidenceThreshold;
    this.localThreshold = localThreshold;
  }

  async match(
    question: string,
    intents: QuestionIntent[],
    published: PublishedQuestion[],
  ): Promise<PublishedQuestion | null> {
    const publishedById = new Map(published.map((item) => [item.id, item]));
    const eligible = intents.filter((intent) => intent.active && publishedById.has(intent.id));
    const local = bestLocalMatch(question, eligible, this.localThreshold);
    if (local) {
      return publishedById.get(local.entry.id) ?? null;
    }

    const activeCatalog = intents.filter((intent) => intent.active);
    if (activeCatalog.length === 0) {
      return null;
    }
    let classification;
    try {
      classification = await this.model.classifyIntent(question, activeCatalog);
    } catch {
      classification = null;
    }
    if (
      !classification
      || classification.intentId === null
      || classification.confidence < this.modelConfidenceThreshold
    ) {
      return null;
    }
    const activeIntent = activeCatalog.find((intent) => intent.id === classification.intentId);
    return activeIntent ? publishedById.get(activeIntent.id) ?? null : null;
  }
}
