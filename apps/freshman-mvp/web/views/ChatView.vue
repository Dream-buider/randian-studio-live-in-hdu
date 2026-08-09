<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  askQuestion,
  type AnswerResult,
  type SourceRef,
} from '../api.js';
import {
  readChatSessionRequest,
  writeChatSessionRequest,
  writeChatSessionRequestIfCurrent,
  type ChatSessionRequest,
} from '../chat-session.js';
import SourceBadge from '../components/SourceBadge.vue';
import BrandHeader from '../components/BrandHeader.vue';
import SourceList from '../components/SourceList.vue';

const router = useRouter();
const pending = ref<ChatSessionRequest | null>(readChatSessionRequest());
const result = ref<AnswerResult | null>(null);
const loading = ref(true);
const failed = ref(false);
const requiresExplicitRetry = ref(false);
let mounted = false;

function isGuideSource(source: SourceRef): boolean {
  return source.type === 'community' && source.title.includes('新生指北');
}

function dedupeSources(sources: SourceRef[]): SourceRef[] {
  const unique = new Map<string, SourceRef>();
  for (const source of sources) {
    const key = JSON.stringify([source.type, source.title, source.url]);
    if (!unique.has(key)) {
      unique.set(key, source);
    }
  }
  return [...unique.values()];
}

const guideSources = computed(() => dedupeSources(
  result.value?.sources.filter(isGuideSource) ?? [],
).slice(0, 3));

const otherSources = computed(() => dedupeSources(
  result.value?.sources.filter((source) => !isGuideSource(source)) ?? [],
));

async function loadAnswer(): Promise<void> {
  if (!pending.value) {
    loading.value = false;
    return;
  }
  const activeRequest: ChatSessionRequest = {
    ...pending.value,
    status: 'in-flight',
    result: null,
  };
  pending.value = activeRequest;
  writeChatSessionRequest(activeRequest);
  loading.value = true;
  failed.value = false;
  requiresExplicitRetry.value = false;
  result.value = null;
  try {
    const answer = await askQuestion(
      activeRequest.question,
      activeRequest.context,
      activeRequest.requestId,
    );
    const succeeded: ChatSessionRequest = {
      ...activeRequest,
      status: 'succeeded',
      result: answer,
    };
    const stored = writeChatSessionRequestIfCurrent(succeeded);
    if (mounted && stored) {
      pending.value = succeeded;
      result.value = answer;
    }
  } catch {
    const failedRequest: ChatSessionRequest = {
      ...activeRequest,
      status: 'failed',
      result: null,
    };
    const stored = writeChatSessionRequestIfCurrent(failedRequest);
    if (mounted && stored) {
      pending.value = failedRequest;
      failed.value = true;
    }
  } finally {
    if (mounted) {
      loading.value = false;
    }
  }
}

onMounted(async () => {
  mounted = true;
  if (!pending.value) {
    loading.value = false;
    return;
  }
  if (pending.value.status === 'succeeded' && pending.value.result) {
    result.value = pending.value.result;
    loading.value = false;
    return;
  }
  if (pending.value.status === 'in-flight') {
    requiresExplicitRetry.value = true;
    loading.value = false;
    return;
  }
  if (pending.value.status === 'failed') {
    failed.value = true;
    loading.value = false;
    return;
  }
  await loadAnswer();
});

onUnmounted(() => {
  mounted = false;
});

function returnToDeck(): void {
  void router.push({ name: 'deck' });
}
</script>

<template>
  <main class="chat-page" data-theme="randian-dawn">
    <header>
      <button type="button" data-action="return-deck" @click="returnToDeck">
        返回问题卡
      </button>
      <BrandHeader subtitle="杭电新生问答与指北" />
    </header>

    <section v-if="pending" class="chat-thread" data-role="chat-thread">
      <article
        class="chat-message chat-message-user"
        data-role="user-message"
        aria-label="你的问题"
      >
        <p>{{ pending.question }}</p>
      </article>

      <div
        v-if="loading"
        class="chat-message chat-message-assistant thinking-message"
        data-role="assistant-thinking"
        role="status"
        aria-label="AI 正在整理回复"
      >
        <span>正在整理回复</span>
        <span class="thinking-dots" aria-hidden="true">
          <i data-role="thinking-dot"></i>
          <i data-role="thinking-dot"></i>
          <i data-role="thinking-dot"></i>
        </span>
      </div>
      <section
        v-else-if="requiresExplicitRetry"
        class="state-card chat-message-assistant"
        role="alert"
      >
        <h1>上一次请求可能仍在处理中</h1>
        <p>为避免重复提交，页面不会自动再次发送；如需继续，请明确重试。</p>
        <button type="button" data-action="retry-answer" @click="loadAnswer">明确重试</button>
      </section>
      <section
        v-else-if="failed"
        class="state-card chat-message-assistant"
        role="alert"
      >
        <h1>回答暂时加载失败</h1>
        <p>没有显示不完整的结果，请稍后重新尝试。</p>
        <button type="button" data-action="retry-answer" @click="loadAnswer">重新获取回答</button>
      </section>
      <section
        v-else-if="result"
        class="answer-card chat-message-assistant"
        data-role="answer-stage"
        aria-live="polite"
      >
        <SourceBadge :status="result.trustStatus" />
        <p>{{ result.answer }}</p>
        <p v-if="result.route === 'web'" class="disclaimer">{{ result.disclaimer }}</p>
        <SourceList :sources="guideSources" heading="继续阅读《杭电新生指北》" />
        <SourceList :sources="otherSources" heading="参考资料" />
      </section>
    </section>
    <section v-else class="empty-chat">
      <h1>还没有待发送的问题</h1>
      <p>返回问题卡后，可以带着当前内容继续提问。</p>
    </section>
  </main>
</template>
