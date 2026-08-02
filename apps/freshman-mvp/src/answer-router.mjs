import { bestMatch } from './matching.mjs';

const HIGH_RISK_PATTERN = /转专业|保研|升学|学费|费用|时间|截止|政策|处分|考试|录取|学籍|户口|贷款/;

function sourceList(entry, type) {
  const sources = Array.isArray(entry.sources)
    ? entry.sources
    : (entry.source ? [entry.source] : []);
  return sources.map((source) => ({ ...source, type }));
}

function responseFromIntent(entry, score, matchMode) {
  const approved = (entry.answerStatus || 'approved') === 'approved'
    && String(entry.answer || '').trim().length > 0;
  if (approved) {
    return {
      route: 'preset',
      answer: entry.answer,
      sources: sourceList(entry, 'preset'),
      score,
      intentId: entry.id,
      canonicalQuestion: entry.question,
      matchMode,
    };
  }
  return {
    route: 'collecting',
    answer: `我们已经识别到你问的是“${entry.question}”。这条回答正在向杭电学长学姐征集真实经验，审核确认后会更新到正式答案中。`,
    sources: [],
    score,
    intentId: entry.id,
    canonicalQuestion: entry.question,
    matchMode,
  };
}

export class AnswerRouter {
  constructor({ config, presetStore, knowledgeStore, reviews, provider }) {
    Object.assign(this, { config, presetStore, knowledgeStore, reviews, provider });
  }

  async answer(rawQuestion) {
    const question = String(rawQuestion || '').trim();
    if (!question) throw Object.assign(new Error('question is required'), { statusCode: 400 });
    if (question.length > 500) throw Object.assign(new Error('question is too long'), { statusCode: 400 });

    const presetState = await this.presetStore.read();
    const preset = bestMatch(question, presetState.items, this.config.presetThreshold);
    if (preset) {
      return responseFromIntent(preset.entry, preset.score, 'local');
    }

    if (typeof this.provider.classifyIntent === 'function') {
      const classification = await this.provider.classifyIntent(question, presetState.items);
      if (classification?.confidence >= (this.config.intentConfidence ?? 0.78)) {
        const intent = presetState.items.find((item) => item.id === classification.intentId);
        if (intent) return responseFromIntent(intent, classification.confidence, 'llm');
      }
    }

    const knowledgeState = await this.knowledgeStore.read();
    const knowledge = bestMatch(question, knowledgeState.items, this.config.knowledgeThreshold);
    if (knowledge) {
      return {
        route: 'knowledge',
        answer: knowledge.entry.answer,
        sources: sourceList(knowledge.entry, 'knowledge'),
        score: knowledge.score,
      };
    }

    const web = await this.provider.answer(question);
    const review = await this.reviews.enqueue({
      question,
      answer: web.text,
      sources: web.sources,
      riskLevel: HIGH_RISK_PATTERN.test(question) ? 'high' : 'normal',
      mode: web.mode,
    });
    return {
      route: 'web',
      answer: web.text,
      sources: web.sources,
      disclaimer: this.config.disclaimer,
      reviewOrdinal: review.ordinal,
      mode: web.mode,
    };
  }
}
