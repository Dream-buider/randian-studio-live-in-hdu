<script setup lang="ts">
import { ref } from 'vue';
import { safeHttpUrl, type PublishedQuestion } from '../api.js';
import SourceBadge from './SourceBadge.vue';

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
      <ul v-if="item.sources.length" class="source-list" aria-label="答案来源">
        <li v-for="source in item.sources" :key="`${source.title}-${source.url}`">
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
      <span class="updated">更新于 {{ item.updatedAt.slice(0, 10) }}</span>
      <button class="text-button" type="button" @click="$emit('report')">
        信息过时？告诉我们
      </button>
    </footer>
  </article>
</template>
