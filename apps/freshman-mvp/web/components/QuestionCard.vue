<script setup lang="ts">
import { ref } from 'vue';
import { type PublishedQuestion } from '../api.js';
import SourceBadge from './SourceBadge.vue';
import SourceList from './SourceList.vue';

defineProps<{
  item: PublishedQuestion;
  progress: string;
}>();

defineEmits<{
  report: [];
}>();

const expanded = ref(false);
</script>

<template>
  <article class="question-card">
    <div class="card-meta">
      <span class="progress">{{ progress }}</span>
      <span class="category">{{ item.category }}</span>
    </div>
    <h1>{{ item.question }}</h1>
    <p class="answer">{{ expanded ? item.fullAnswer : item.summary }}</p>
    <button
      class="text-button"
      type="button"
      data-action="expand"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收起完整回答' : '展开完整回答' }}
    </button>
    <footer>
      <SourceBadge :status="item.trustStatus" />
      <SourceList :sources="item.sources" heading="参考资料" />
      <span class="updated">更新于 {{ item.updatedAt.slice(0, 10) }}</span>
      <button class="text-button" type="button" @click="$emit('report')">
        信息过时？告诉我们
      </button>
    </footer>
  </article>
</template>
