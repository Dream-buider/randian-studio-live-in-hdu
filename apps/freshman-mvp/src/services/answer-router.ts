import { ServiceUnavailableError } from '../domain/errors.js';
import type { AnswerResult } from '../domain/models.js';
import type {
  KnowledgeProvider,
  ModelProvider,
  SearchProvider,
  SearchResult,
} from '../providers/contracts.js';
import type {
  ContentRepository,
  ReviewRepository,
} from '../repositories/contracts.js';
import type { IntentMatcher } from './intent-matcher.js';

export const DISCLAIMER = '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别';
const REFUSAL_PATTERN = /未收录|抱歉[，,\s]*(?:我)?(?:无法|不能)(?:提供|回答)?|(?:无法|不能)(?:提供|回答)/u;

interface AnswerRouterDependencies {
  content: ContentRepository;
  reviews: ReviewRepository;
  intentMatcher: IntentMatcher;
  knowledge: KnowledgeProvider;
  search: SearchProvider;
  model: ModelProvider;
  disclaimer: string;
}

export class AnswerRouter {
  private readonly deps: AnswerRouterDependencies;

  constructor(deps: AnswerRouterDependencies) {
    this.deps = deps;
  }

  async answer(rawQuestion: string): Promise<AnswerResult> {
    const question = rawQuestion.trim();
    const [intents, published] = await Promise.all([
      this.deps.content.getIntentCatalog(),
      this.deps.content.listPublishedQuestions(),
    ]);
    const preset = await this.deps.intentMatcher.match(question, intents, published);
    if (preset) {
      return {
        route: 'preset',
        trustStatus: 'approved',
        answer: preset.fullAnswer,
        sources: preset.sources,
        intentId: preset.id,
      };
    }

    let knowledge = null;
    try {
      knowledge = await this.deps.knowledge.search(question);
    } catch {
      knowledge = null;
    }
    if (knowledge && knowledge.answer.trim().length > 0) {
      return {
        route: 'knowledge',
        trustStatus: 'knowledge',
        answer: knowledge.answer.trim(),
        sources: knowledge.sources,
      };
    }

    let search: SearchResult;
    try {
      search = await this.deps.search.search(question);
    } catch {
      search = { available: false, items: [] };
    }
    const modelAnswer = await this.deps.model.synthesize({ question, search });
    const answer = modelAnswer.text.trim();
    if (answer.length === 0 || REFUSAL_PATTERN.test(answer)) {
      throw new ServiceUnavailableError('Model answer is temporarily unavailable');
    }

    let review;
    try {
      review = await this.deps.reviews.enqueue({
        question,
        answer,
        sources: modelAnswer.sources,
      });
    } catch {
      throw new ServiceUnavailableError('Answer review queue is temporarily unavailable');
    }

    return {
      route: 'web',
      trustStatus: 'web-unverified',
      answer,
      sources: modelAnswer.sources,
      disclaimer: this.deps.disclaimer,
      reviewOrdinal: review.ordinal,
    };
  }
}
