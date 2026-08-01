import { ServiceUnavailableError } from '../domain/errors.js';
import type { AnswerResult } from '../domain/models.js';
import type {
  KnowledgeProviderResult,
  KnowledgeHit,
  KnowledgeSearchResult,
  KnowledgeProvider,
  ModelAnswer,
  ModelProvider,
  SearchProvider,
  WebSearchResult,
} from '../providers/contracts.js';
import { sourceFromSearchLead } from '../providers/hdu-search-provider.js';
import type {
  ContentRepository,
  ReviewRepository,
} from '../repositories/contracts.js';
import type { IntentMatcher } from './intent-matcher.js';

export const DISCLAIMER = '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别';
const UNUSABLE_ANSWER_PATTERNS = [
  /未收录/u,
  /(?:不知道|不清楚)(?:答案|情况|信息|怎么|具体)?/u,
  /(?:暂时|目前)?(?:无法|不能)(?:回答|确定|提供|获知|查询)/u,
  /作为(?:ai|人工智能).*(?:没有|缺少|无法|不能|不具备)/u,
  /(?:没有|缺少)(?:相关|足够|可用)?(?:信息|资料|答案)/u,
];

export function isUsableAnswer(value: string): boolean {
  const normalized = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
  return normalized.length > 0
    && !UNUSABLE_ANSWER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function usableSearchItems(search: WebSearchResult): WebSearchResult['leads'] {
  if (search.status !== 'available') {
    return [];
  }
  return search.leads.filter((item) => (
    item.title.trim().length > 0
    && item.url.trim().length > 0
    && item.snippet.trim().length > 0
  ));
}

function searchSources(search: WebSearchResult): ModelAnswer['sources'] {
  return usableSearchItems(search).map(sourceFromSearchLead);
}

function isKnowledgeSearchResult(
  value: KnowledgeProviderResult,
): value is KnowledgeSearchResult {
  return value !== null
    && 'status' in value
    && 'hits' in value
    && Array.isArray(value.hits);
}

function normalizedKnowledge(
  value: KnowledgeProviderResult,
): { answer: string; sources: ModelAnswer['sources']; hits?: KnowledgeHit[] } | null {
  if (value === null) {
    return null;
  }
  if (!isKnowledgeSearchResult(value)) {
    const answer = value.answer.trim();
    return answer.length > 0 ? { answer, sources: value.sources } : null;
  }
  if (value.status !== 'available' || value.hits.length === 0) {
    return null;
  }
  const hits = value.hits
    .map((hit) => ({ ...hit, content: hit.content.trim(), title: hit.title.trim() }))
    .filter((hit) => hit.content.length > 0);
  const answer = hits
    .map((hit) => hit.content)
    .join('\n\n');
  if (answer.length === 0) {
    return null;
  }
  const seen = new Set<string>();
  const sources = hits
    .map((hit) => hit.source)
    .filter((source) => {
      const key = `${source.type}\0${source.title}\0${source.url}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  return { answer, sources, hits };
}

function deterministicFallback(search: WebSearchResult): ModelAnswer {
  const items = usableSearchItems(search);
  if (items.length > 0) {
    const evidence = items
      .map((item, index) => `${index + 1}. ${item.title.trim()}：${item.snippet.trim()}`)
      .join('\n');
    return {
      text: [
        '目前可供参考的公开线索如下，内容尚未完成社区审核：',
        evidence,
        '请打开以上来源，并通过学校官网、学院通知或辅导员核验最新安排。该问题已进入人工审核队列。',
      ].join('\n'),
      sources: searchSources(search),
    };
  }
  const availability = search.status === 'available'
    ? '当前检索没有返回可直接引用的公开线索。'
    : '当前自动检索服务暂时不可用。';
  return {
    text: [
      availability,
      '请先通过学校官网（杭州电子科技大学官网）、学校官方微信公众号、所在学院通知或辅导员核验最新安排。',
      '该问题已进入人工审核队列，审核确认后会补充到知识库。',
    ].join(''),
    sources: [],
  };
}

function isVerifiedOfficialFallback(search: WebSearchResult): boolean {
  const items = usableSearchItems(search);
  return items.length > 0 && items.every((item) => (
    item.engines.includes('verified-official-fallback')
  ));
}

function deterministicVerifiedOfficialFallback(search: WebSearchResult): ModelAnswer {
  const evidence = usableSearchItems(search)
    .map((item, index) => `${index + 1}. ${item.title.trim()}：${item.snippet.trim()}`)
    .join('\n');
  return {
    text: [
      '根据已核验的杭州电子科技大学官方页面，可以确认以下内容：',
      evidence,
      '现有线索不足以确认当前完整社团名单或招新时间，请以校方网站可见的最新通知为准。',
      '通用建议：结合自己的兴趣和可投入时间选择社团。',
      '该问题已进入人工审核队列。',
    ].join('\n'),
    sources: searchSources(search),
  };
}

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

    let knowledge: KnowledgeProviderResult = null;
    try {
      knowledge = await this.deps.knowledge.search(question);
    } catch {
      knowledge = null;
    }
    const normalized = normalizedKnowledge(knowledge);
    if (normalized) {
      let answer = normalized.answer;
      if (normalized.hits && this.deps.model.synthesizeKnowledge) {
        try {
          const synthesized = await this.deps.model.synthesizeKnowledge({
            question,
            hits: normalized.hits,
          });
          if (isUsableAnswer(synthesized.text)) {
            answer = synthesized.text.trim();
          }
        } catch {
          // Deterministic hit content remains available when synthesis fails.
        }
      }
      return {
        route: 'knowledge',
        trustStatus: 'knowledge',
        answer,
        sources: normalized.sources,
      };
    }

    let search: WebSearchResult;
    try {
      search = await this.deps.search.search(question);
    } catch {
      search = { status: 'temporarily-unavailable', leads: [] };
    }
    const verifiedOfficialFallback = isVerifiedOfficialFallback(search);
    let modelAnswer: ModelAnswer | null = null;
    if (!verifiedOfficialFallback) {
      try {
        modelAnswer = await this.deps.model.synthesize({ question, search });
      } catch {
        modelAnswer = null;
      }
    }
    const fallback = verifiedOfficialFallback
      ? deterministicVerifiedOfficialFallback(search)
      : deterministicFallback(search);
    let answer: string;
    let sources: ModelAnswer['sources'];
    if (modelAnswer !== null && isUsableAnswer(modelAnswer.text)) {
      answer = modelAnswer.text.trim();
      sources = searchSources(search);
    } else {
      answer = fallback.text;
      sources = fallback.sources;
    }

    let review;
    try {
      review = await this.deps.reviews.enqueue({
        question,
        answer,
        sources,
        providerStatus: search.status,
        rawSearchLeads: search.leads,
      });
    } catch {
      throw new ServiceUnavailableError('Answer review queue is temporarily unavailable');
    }

    return {
      route: 'web',
      trustStatus: 'web-unverified',
      answer,
      sources,
      disclaimer: this.deps.disclaimer,
      reviewOrdinal: review.ordinal,
    };
  }
}
