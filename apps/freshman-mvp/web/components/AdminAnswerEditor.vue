<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  publishAnswer,
  type AdminIntent,
  type RawAnswer,
  type SourceRef,
} from '../api.js';

const props = defineProps<{
  intent: AdminIntent | null;
  rawAnswers: RawAnswer[];
  loadingRaw: boolean;
}>();

const emit = defineEmits<{
  published: [intentId: string];
}>();

const summary = ref('');
const fullAnswer = ref('');
const sourceTitle = ref('');
const sourceUrl = ref('');
const reviewerId = ref('local-admin');
const confirming = ref(false);
const submitting = ref(false);
const feedback = ref('');
const errorMessage = ref('');
const publishTrigger = ref<HTMLButtonElement | null>(null);
const cancelConfirmation = ref<HTMLButtonElement | null>(null);
const confirmPublishButton = ref<HTMLButtonElement | null>(null);

const isReservedQ11 = computed(
  () => props.intent?.externalId?.trim().toUpperCase() === 'Q11',
);
const summaryCount = computed(() => Array.from(summary.value.trim()).length);
const canPublish = computed(() => (
  !isReservedQ11.value
  && summaryCount.value >= 20
  && summaryCount.value <= 150
  && fullAnswer.value.trim().length > 0
  && sourceTitle.value.trim().length > 0
  && reviewerId.value.trim().length > 0
  && !submitting.value
));

watch(
  () => props.intent?.id,
  () => {
    const published = props.intent?.publishedAnswer;
    summary.value = published?.summary ?? '';
    fullAnswer.value = published?.fullAnswer ?? '';
    sourceTitle.value = published?.sources[0]?.title ?? '';
    sourceUrl.value = published?.sources[0]?.url ?? '';
    reviewerId.value = 'local-admin';
    confirming.value = false;
    feedback.value = '';
    errorMessage.value = '';
  },
  { immediate: true },
);

function requestPublish(): void {
  if (canPublish.value) {
    confirming.value = true;
    feedback.value = '';
    void nextTick(() => cancelConfirmation.value?.focus());
  }
}

function closeConfirmation(restoreFocus = true): void {
  confirming.value = false;
  if (restoreFocus) {
    void nextTick(() => publishTrigger.value?.focus());
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (!confirming.value) {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeConfirmation();
    return;
  }
  if (event.key !== 'Tab') {
    return;
  }
  const first = cancelConfirmation.value;
  const last = confirmPublishButton.value;
  if (!first || !last) {
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function confirmPublish(): Promise<void> {
  if (!props.intent || !canPublish.value) {
    return;
  }
  submitting.value = true;
  errorMessage.value = '';
  const sources: SourceRef[] = [{
    type: 'community',
    title: sourceTitle.value.trim(),
    url: sourceUrl.value.trim(),
    updatedAt: null,
  }];
  try {
    const result = await publishAnswer(props.intent.id, {
      summary: summary.value.trim(),
      fullAnswer: fullAnswer.value.trim(),
      sources,
      reviewerId: reviewerId.value.trim(),
    });
    feedback.value = `已创建第 ${result.version} 个发布版本，旧版本未被覆盖。`;
    closeConfirmation();
    emit('published', props.intent.id);
  } catch {
    errorMessage.value = '发布失败，请检查内容后重试。';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => document.addEventListener('keydown', onDocumentKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown));
</script>

<template>
  <section class="admin-editor" aria-labelledby="answer-editor-title">
    <template v-if="intent">
      <header>
        <div>
          <p>{{ intent.externalId ?? '未编号' }} · {{ intent.category }}</p>
          <h2 id="answer-editor-title">{{ intent.question }}</h2>
        </div>
        <span class="admin-status">{{ intent.publishedAnswer ? '已发布' : '待整理' }}</span>
      </header>

      <p class="intent-description">{{ intent.intentDescription }}</p>

      <section class="raw-evidence" aria-labelledby="raw-evidence-title">
        <h3 id="raw-evidence-title">原始回答（未发布）</h3>
        <p v-if="loadingRaw">正在加载原始回答…</p>
        <p v-else-if="rawAnswers.length === 0">暂无原始回答。</p>
        <article v-for="answer in rawAnswers" :key="answer.id">
          <p>{{ answer.answer }}</p>
          <footer>{{ answer.sourceLabel }} · 单元格 {{ answer.sourceCell }}</footer>
        </article>
      </section>

      <p v-if="isReservedQ11" class="q11-notice">
        Q11 按要求保持空白，暂不提供自动填充。
      </p>

      <form v-else @submit.prevent="requestPublish">
        <label>
          简明答案
          <textarea v-model="summary" aria-label="简明答案" rows="4" />
        </label>
        <p
          data-role="summary-count"
          :class="{ invalid: summaryCount < 20 || summaryCount > 150 }"
          aria-live="polite"
        >
          {{ summaryCount }} / 150 个 Unicode 字符（允许 20–150）
        </p>

        <label>
          完整答案
          <textarea v-model="fullAnswer" aria-label="完整答案" rows="7" />
        </label>
        <fieldset>
          <legend>来源（至少一条）</legend>
          <label>
            来源标题
            <input v-model="sourceTitle" aria-label="来源标题">
          </label>
          <label>
            来源链接（可留空）
            <input v-model="sourceUrl" aria-label="来源链接" inputmode="url">
          </label>
        </fieldset>
        <label>
          审核人
          <input v-model="reviewerId" aria-label="审核人">
        </label>

        <button
          ref="publishTrigger"
          type="button"
          data-action="publish"
          :disabled="!canPublish"
          @click="requestPublish"
        >
          创建新的发布版本
        </button>
      </form>

      <section
        v-if="confirming"
        class="publish-confirmation"
        role="alertdialog"
        aria-label="确认发布"
        aria-modal="true"
      >
        <p>确认后将创建新版本，旧版本会保留。</p>
        <button ref="cancelConfirmation" type="button" @click="closeConfirmation()">返回检查</button>
        <button
          ref="confirmPublishButton"
          type="button"
          data-action="confirm-publish"
          :disabled="submitting"
          @click="confirmPublish"
        >
          确认发布新版本
        </button>
      </section>
      <p v-if="feedback" class="success-message" role="status">{{ feedback }}</p>
      <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
    </template>
    <p v-else>请选择一个问题意图。</p>
  </section>
</template>
