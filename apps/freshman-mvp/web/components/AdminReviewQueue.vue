<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import {
  decideReview,
  type ReviewDecisionInput,
  type ReviewStatus,
  type ReviewTask,
} from '../api.js';
import SourceList from './SourceList.vue';

const props = defineProps<{
  reviews: ReviewTask[];
}>();

const emit = defineEmits<{
  decided: [reviewId: string];
}>();

interface DecisionDraft {
  reviewedAnswer: string;
  feedbackTarget: string;
  note: string;
  reviewerId: string;
}

const drafts = reactive<Record<string, DecisionDraft>>({});
const busyId = ref<string | null>(null);
const message = ref('');

watch(
  () => props.reviews,
  (reviews) => {
    for (const review of reviews) {
      drafts[review.id] ??= {
        reviewedAnswer: review.reviewedAnswer ?? '',
        feedbackTarget: review.feedbackTarget ?? '',
        note: review.decisionNote ?? '',
        reviewerId: review.reviewerId ?? 'local-admin',
      };
    }
  },
  { immediate: true },
);

function actionLabel(status: Exclude<ReviewStatus, 'pending'>): string {
  return status === 'approved' ? '通过' : status === 'rejected' ? '驳回' : '需补充';
}

function canDecide(review: ReviewTask, status: Exclude<ReviewStatus, 'pending'>): boolean {
  const draft = drafts[review.id];
  return Boolean(
    draft
    && draft.feedbackTarget.trim()
    && draft.note.trim()
    && draft.reviewerId.trim()
    && (status === 'rejected' || draft.reviewedAnswer.trim()),
  );
}

async function decide(
  review: ReviewTask,
  status: Exclude<ReviewStatus, 'pending'>,
): Promise<void> {
  if (!canDecide(review, status)) {
    return;
  }
  const draft = drafts[review.id];
  const payload: ReviewDecisionInput = {
    status,
    reviewerId: draft.reviewerId.trim(),
    note: draft.note.trim(),
    reviewedAnswer: status === 'rejected' ? null : draft.reviewedAnswer.trim(),
    feedbackTarget: draft.feedbackTarget.trim(),
  };
  busyId.value = review.id;
  message.value = '';
  try {
    await decideReview(review.id, payload);
    message.value = `第 ${review.ordinal} 个未收录问题已记录“${actionLabel(status)}”决策。`;
    emit('decided', review.id);
  } catch {
    message.value = `第 ${review.ordinal} 个未收录问题处理失败，请重试。`;
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <section class="review-queue" aria-labelledby="review-queue-title">
    <header>
      <div>
        <p>严格使用服务器返回顺序</p>
        <h2 id="review-queue-title">待审核问题队列</h2>
      </div>
      <span>{{ reviews.length }} 条待处理</span>
    </header>
    <p v-if="reviews.length === 0">当前没有待审核问题。</p>
    <article
      v-for="review in reviews"
      :key="review.id"
      data-role="review-row"
      class="review-row"
    >
      <header>
        <strong>第 {{ review.ordinal }} 个未收录</strong>
        <span :data-risk="review.riskLevel">{{ review.riskLevel }}</span>
      </header>
      <h3>{{ review.question }}</h3>
      <p class="temporary-answer">{{ review.answer }}</p>
      <SourceList
        v-if="review.sources.length"
        :sources="review.sources"
        heading="参考资料"
        show-hostname
      />
      <p v-else>暂无联网来源</p>
      <dl>
        <div><dt>状态</dt><dd>{{ review.status }}</dd></div>
        <div><dt>创建时间</dt><dd>{{ review.createdAt }}</dd></div>
      </dl>

      <label>
        审核后答案
        <textarea v-model="drafts[review.id].reviewedAnswer" aria-label="审核后答案" rows="3" />
      </label>
      <label>
        回流目标
        <input v-model="drafts[review.id].feedbackTarget" aria-label="回流目标">
      </label>
      <label>
        审核说明
        <input v-model="drafts[review.id].note" aria-label="审核说明">
      </label>
      <label>
        审核人
        <input v-model="drafts[review.id].reviewerId" aria-label="审核人">
      </label>
      <div class="decision-actions">
        <button
          v-for="status in (['approved', 'rejected', 'needs_more'] as const)"
          :key="status"
          type="button"
          :aria-label="`${actionLabel(status)}第 ${review.ordinal} 个未收录问题`"
          :disabled="busyId === review.id || !canDecide(review, status)"
          @click="decide(review, status)"
        >
          {{ actionLabel(status) }}
        </button>
      </div>
    </article>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
