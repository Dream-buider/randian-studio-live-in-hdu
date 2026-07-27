<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { routerKey, type Router } from 'vue-router';
import { listQuestions, type PublishedQuestion } from '../api.js';
import type { QuestionContext } from '../api.js';
import AskSheet from '../components/AskSheet.vue';
import QuestionCard from '../components/QuestionCard.vue';
import QuestionCatalog from '../components/QuestionCatalog.vue';

const STORAGE_KEY = 'live-in-hdu:current-question-id';
const PENDING_KEY = 'live-in-hdu:pending-question';
const router = inject<Router | null>(routerKey, null);
const questions = ref<PublishedQuestion[]>([]);
const currentIndex = ref(0);
const catalogOpen = ref(false);
const askOpen = ref(false);
const touchStartX = ref<number | null>(null);
const loading = ref(true);
const loadFailed = ref(false);

const current = computed(() => questions.value[currentIndex.value] ?? null);
const activeContext = computed<QuestionContext>(() => (
  current.value
    ? questionContext(current.value)
    : { intentId: null, question: '自由提问', category: null }
));
const progress = computed(() => {
  const position = String(currentIndex.value + 1).padStart(2, '0');
  const total = String(questions.value.length).padStart(2, '0');
  return `${position} / ${total}`;
});

function next(): void {
  if (currentIndex.value < questions.value.length - 1) {
    selectIndex(currentIndex.value + 1);
  }
}

function previous(): void {
  if (currentIndex.value > 0) {
    selectIndex(currentIndex.value - 1);
  }
}

function selectIndex(index: number): void {
  currentIndex.value = index;
  const selected = questions.value[index];
  if (selected) {
    localStorage.setItem(STORAGE_KEY, selected.id);
  }
}

function selectQuestion(id: string): void {
  const index = questions.value.findIndex((question) => question.id === id);
  if (index >= 0) {
    selectIndex(index);
    catalogOpen.value = false;
  }
}

function onTouchStart(event: TouchEvent): void {
  touchStartX.value = event.touches[0]?.clientX ?? null;
}

function onTouchEnd(event: TouchEvent): void {
  const endX = event.changedTouches[0]?.clientX;
  if (touchStartX.value === null || endX === undefined) {
    return;
  }
  const distance = endX - touchStartX.value;
  touchStartX.value = null;
  if (distance <= -50) {
    next();
  } else if (distance >= 50) {
    previous();
  }
}

function questionContext(question: PublishedQuestion): QuestionContext {
  return {
    intentId: question.id,
    question: question.question,
    category: question.category,
  };
}

function submitQuestion(payload: { question: string; context: QuestionContext }): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  askOpen.value = false;
  void router?.push({
    name: 'chat',
    state: { pendingQuestion: JSON.stringify(payload) },
  });
}

async function load(): Promise<void> {
  loading.value = true;
  loadFailed.value = false;
  try {
    questions.value = await listQuestions();
    const storedId = localStorage.getItem(STORAGE_KEY);
    const storedIndex = questions.value.findIndex((question) => question.id === storedId);
    if (storedIndex >= 0) {
      currentIndex.value = storedIndex;
    } else if (questions.value[0]) {
      selectIndex(0);
    }
  } catch {
    questions.value = [];
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await load();
});
</script>

<template>
  <main class="deck-page">
    <header>
      <div>
        <p class="brand">LIVE IN HDU</p>
        <p>新生必看 {{ questions.length }} 问</p>
      </div>
      <button
        v-if="questions.length"
        type="button"
        data-action="catalog"
        @click="catalogOpen = true"
      >
        全部问题
      </button>
    </header>
    <p v-if="loading" role="status">正在加载新生问题…</p>
    <section v-else-if="loadFailed" class="state-card" role="alert">
      <h1>问题列表暂时加载失败</h1>
      <p>请检查本地服务后重试，你仍然可以直接提问。</p>
      <button type="button" data-action="retry-questions" @click="load">重新加载</button>
    </section>
    <section v-else-if="questions.length === 0" class="state-card">
      <h1>暂时还没有已审核并发布的问题</h1>
      <p>管理员发布标准答案后会显示在这里；现在也可以直接提问。</p>
    </section>
    <div
      v-if="current"
      data-role="deck-surface"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <QuestionCard
        :key="current.id"
        :item="current"
        :progress="progress"
        @report="askOpen = true"
      />
    </div>
    <nav v-if="current" aria-label="问题翻页">
      <button
        type="button"
        data-action="previous"
        :disabled="currentIndex === 0"
        @click="previous"
      >
        上一题
      </button>
      <button type="button" data-action="next" @click="next">下一题</button>
    </nav>
    <button
      v-if="!loading"
      class="ask-action"
      type="button"
      data-action="ask"
      @click="askOpen = true"
    >
      没有解决我的问题，直接提问
    </button>
    <QuestionCatalog
      v-if="catalogOpen"
      :questions="questions"
      @select="selectQuestion"
      @close="catalogOpen = false"
    />
    <AskSheet
      v-if="askOpen"
      :context="activeContext"
      @submit="submitQuestion"
      @close="askOpen = false"
    />
  </main>
</template>
