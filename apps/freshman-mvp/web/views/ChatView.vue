<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  askQuestion,
  safeHttpUrl,
  type AnswerResult,
  type QuestionContext,
} from '../api.js';
import SourceBadge from '../components/SourceBadge.vue';

interface PendingQuestion {
  question: string;
  context: QuestionContext;
}

const PENDING_KEY = 'live-in-hdu:pending-question';
const router = useRouter();
const pending = ref<PendingQuestion | null>(null);
const result = ref<AnswerResult | null>(null);
const loading = ref(true);
const failed = ref(false);

const context = computed(() => pending.value?.context ?? null);

async function loadAnswer(): Promise<void> {
  if (!pending.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  failed.value = false;
  result.value = null;
  try {
    result.value = await askQuestion(pending.value.question, pending.value.context);
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const stored = sessionStorage.getItem(PENDING_KEY);
  try {
    pending.value = stored ? JSON.parse(stored) as PendingQuestion : null;
  } catch {
    pending.value = null;
  }
  await loadAnswer();
});

function returnToDeck(): void {
  void router.push({ name: 'deck' });
}
</script>

<template>
  <main class="chat-page">
    <header>
      <button type="button" data-action="return-deck" @click="returnToDeck">
        返回问题卡
      </button>
      <p class="brand">LIVE IN HDU</p>
    </header>

    <section v-if="context" class="context-card">
      <p class="eyebrow">参考问题</p>
      <h1>{{ context.question }}</h1>
      <p v-if="context.category">{{ context.category }}</p>
    </section>

    <p v-if="loading" role="status">正在整理回答…</p>
    <section v-else-if="failed" class="state-card" role="alert">
      <h1>回答暂时加载失败</h1>
      <p>没有显示不完整的结果，请稍后重新尝试。</p>
      <button type="button" data-action="retry-answer" @click="loadAnswer">重新获取回答</button>
    </section>
    <section v-else-if="result" class="answer-card" aria-live="polite">
      <SourceBadge :status="result.trustStatus" />
      <p>{{ result.answer }}</p>
      <p v-if="result.route === 'web'" class="disclaimer">{{ result.disclaimer }}</p>
      <ul v-if="result.sources.length" aria-label="回答来源">
        <li v-for="source in result.sources" :key="`${source.title}-${source.url}`">
          <a
            v-if="safeHttpUrl(source.url)"
            :href="safeHttpUrl(source.url) ?? undefined"
            target="_blank"
            rel="noreferrer"
          >
            {{ source.title }}
          </a>
          <span v-else>{{ source.title }}</span>
        </li>
      </ul>
    </section>
    <section v-else class="empty-chat">
      <h1>还没有待发送的问题</h1>
      <p>返回问题卡后，可以带着当前内容继续提问。</p>
    </section>
  </main>
</template>
