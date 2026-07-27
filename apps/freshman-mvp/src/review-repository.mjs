import { randomUUID } from 'node:crypto';

const STATUS_LABELS = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
};

const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function chineseNumber(value) {
  if (value < 1 || value > 99) return String(value);
  if (value < 10) return DIGITS[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens === 1 ? '' : DIGITS[tens]}十${DIGITS[ones]}`;
}

export function ordinalLabel(ordinal) {
  return `第${chineseNumber(ordinal)}个未收录`;
}

function decorate(item) {
  return {
    ...item,
    displayLabel: ordinalLabel(item.ordinal),
    statusLabel: STATUS_LABELS[item.status] || item.status,
  };
}

export class ReviewRepository {
  constructor(store, knowledgeStore) {
    this.store = store;
    this.knowledgeStore = knowledgeStore;
  }

  async enqueue({ question, answer, sources = [], riskLevel = 'normal', mode = 'demo' }) {
    return this.store.update((state) => {
      const item = {
        id: randomUUID(),
        ordinal: state.nextOrdinal,
        question,
        answer,
        sources,
        mode,
        riskLevel,
        status: 'pending',
        finalAnswer: '',
        reviewerId: '',
        createdAt: new Date().toISOString(),
        reviewedAt: null,
      };
      state.nextOrdinal += 1;
      state.items.push(item);
      return decorate(item);
    });
  }

  async list({ status } = {}) {
    const state = await this.store.read();
    return state.items
      .filter((item) => !status || item.status === status)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.ordinal - right.ordinal)
      .map(decorate);
  }

  async decide(id, { status, finalAnswer = '', reviewerId = 'local-admin' }) {
    if (!['approved', 'rejected'].includes(status)) {
      throw Object.assign(new Error('status must be approved or rejected'), { statusCode: 400 });
    }
    let decided;
    await this.store.update((state) => {
      const item = state.items.find((candidate) => candidate.id === id);
      if (!item) throw Object.assign(new Error('review item not found'), { statusCode: 404 });
      const answer = String(finalAnswer || item.answer).trim();
      if (status === 'approved' && !answer) {
        throw Object.assign(new Error('approved answer cannot be empty'), { statusCode: 400 });
      }
      item.status = status;
      item.finalAnswer = answer;
      item.reviewerId = reviewerId;
      item.reviewedAt = new Date().toISOString();
      decided = structuredClone(item);
    });

    if (status === 'approved' && this.knowledgeStore) {
      await this.knowledgeStore.update((state) => {
        const existing = state.items.find((item) => item.reviewId === id);
        if (!existing) {
          state.items.push({
            id: `review-${id}`,
            reviewId: id,
            question: decided.question,
            aliases: [],
            keywords: [decided.question],
            answer: decided.finalAnswer,
            source: { title: `人工审核问题 #${decided.ordinal}`, url: '' },
            reviewedAt: decided.reviewedAt,
          });
        }
      });
    }
    return decorate(decided);
  }
}
