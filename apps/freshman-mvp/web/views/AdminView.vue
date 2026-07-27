<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  ApiResponseError,
  listAdminIntents,
  listPendingReviews,
  listRawAnswers,
  type AdminIntent,
  type RawAnswer,
  type ReviewTask,
} from '../api.js';
import AdminAnswerEditor from '../components/AdminAnswerEditor.vue';
import AdminIntentList from '../components/AdminIntentList.vue';
import AdminReviewQueue from '../components/AdminReviewQueue.vue';

const intents = ref<AdminIntent[]>([]);
const reviews = ref<ReviewTask[]>([]);
const selected = ref<AdminIntent | null>(null);
const rawAnswers = ref<RawAnswer[]>([]);
const loading = ref(true);
const loadingRaw = ref(false);
const localOnly = ref(false);
const errorMessage = ref('');
let rawRequestSequence = 0;

function recordError(error: unknown): void {
  if (error instanceof ApiResponseError && error.status === 403) {
    localOnly.value = true;
    errorMessage.value = '管理端仅允许在本机打开';
    return;
  }
  errorMessage.value = '管理数据暂时加载失败，请稍后重试。';
}

async function selectIntent(intent: AdminIntent): Promise<void> {
  const requestSequence = ++rawRequestSequence;
  selected.value = intent;
  rawAnswers.value = [];
  loadingRaw.value = true;
  try {
    const loadedRawAnswers = await listRawAnswers(intent.id);
    if (requestSequence === rawRequestSequence && selected.value?.id === intent.id) {
      rawAnswers.value = loadedRawAnswers;
    }
  } catch (error) {
    if (requestSequence === rawRequestSequence && selected.value?.id === intent.id) {
      recordError(error);
    }
  } finally {
    if (requestSequence === rawRequestSequence && selected.value?.id === intent.id) {
      loadingRaw.value = false;
    }
  }
}

async function refreshPublishedIntent(intentId: string): Promise<void> {
  try {
    const loadedIntents = await listAdminIntents();
    intents.value = loadedIntents;
    selected.value = loadedIntents.find((item) => item.id === intentId) ?? null;
  } catch (error) {
    recordError(error);
  }
}

function removeDecidedReview(reviewId: string): void {
  reviews.value = reviews.value.filter((review) => review.id !== reviewId);
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  localOnly.value = false;
  try {
    const [loadedIntents, loadedReviews] = await Promise.all([
      listAdminIntents(),
      listPendingReviews(),
    ]);
    intents.value = loadedIntents;
    reviews.value = loadedReviews;
    if (loadedIntents[0]) {
      await selectIntent(loadedIntents[0]);
    }
  } catch (error) {
    recordError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="admin-page">
    <header class="admin-page-header">
      <div>
        <p class="brand">LIVE IN HDU · LOCAL OPERATIONS</p>
        <h1>内容与审核控制台</h1>
        <p>仅记录人工决策；不会自动发布原始回答，也不会声称已同步知识库。</p>
      </div>
      <RouterLink to="/">返回用户端</RouterLink>
    </header>

    <aside class="import-audit-notice">
      <strong>导入审计</strong>
      <span>
        请核对
        <code>output/freshman-platform/import-report.json</code>；
        未加载的拒绝单元格不会被视为已接受。
      </span>
    </aside>

    <section v-if="loading" class="state-card">正在加载管理数据…</section>
    <section v-else-if="errorMessage" class="state-card" role="alert">
      <h2>{{ errorMessage }}</h2>
      <p v-if="localOnly">请回到运行服务的电脑，通过 localhost 打开本页面。</p>
      <button v-else type="button" @click="load">重试</button>
    </section>
    <template v-else>
      <section class="admin-workspace">
        <AdminIntentList
          :intents="intents"
          :selected-id="selected?.id ?? null"
          @select="selectIntent"
        />
        <AdminAnswerEditor
          :intent="selected"
          :raw-answers="rawAnswers"
          :loading-raw="loadingRaw"
          @published="refreshPublishedIntent"
        />
      </section>
      <AdminReviewQueue :reviews="reviews" @decided="removeDecidedReview" />
    </template>
  </main>
</template>
