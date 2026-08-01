<script setup lang="ts">
import { safeHttpUrl, type SourceRef } from '../api.js';

defineProps<{
  sources: SourceRef[];
  heading: string;
  showHostname?: boolean;
}>();

function label(source: SourceRef): string {
  if (source.type === 'official') return '杭电官方';
  if (source.type === 'student') return '社区经验';
  if (source.type === 'community' && source.title.includes('新生指北')) return '新生指北';
  if (source.type === 'community') return '社区经验';
  return '网络线索·待核验';
}

function hostname(source: SourceRef): string {
  const url = safeHttpUrl(source.url);
  return url ? new URL(url).hostname : '';
}
</script>

<template>
  <section v-if="sources.length" class="source-list" :aria-label="heading">
    <h2 class="source-list-heading">{{ heading }}</h2>
    <ul>
      <li
        v-for="source in sources"
        :key="`${source.type}:${source.title}:${source.url}`"
        :data-source-type="source.type"
      >
        <span class="source-type">{{ label(source) }}</span>
        <a
          v-if="safeHttpUrl(source.url)"
          :href="safeHttpUrl(source.url) ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ source.title }}
        </a>
        <span v-else>{{ source.title }}</span>
        <small v-if="showHostname && safeHttpUrl(source.url)" class="source-hostname">
          {{ hostname(source) }}
        </small>
      </li>
    </ul>
  </section>
</template>
