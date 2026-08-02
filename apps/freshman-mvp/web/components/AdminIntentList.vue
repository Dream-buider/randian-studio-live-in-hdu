<script setup lang="ts">
import type { AdminIntent } from '../api.js';

defineProps<{
  intents: AdminIntent[];
  selectedId: string | null;
}>();

defineEmits<{
  select: [intent: AdminIntent];
}>();
</script>

<template>
  <aside class="admin-intents" aria-label="问题意图列表">
    <header>
      <h2>问题意图</h2>
      <p>共 {{ intents.length }} 个问题意图</p>
    </header>
    <ul>
      <li v-for="intent in intents" :key="intent.id">
        <button
          type="button"
          :data-intent-id="intent.id"
          :aria-current="selectedId === intent.id ? 'true' : undefined"
          @click="$emit('select', intent)"
        >
          <span>{{ intent.externalId ?? '未编号' }} · {{ intent.category }}</span>
          <strong>{{ intent.question }}</strong>
          <small>
            {{ intent.publishedAnswer ? '已发布' : '待整理' }}
            · 原始回答 {{ intent.rawAnswerCount }} 条
          </small>
        </button>
      </li>
    </ul>
  </aside>
</template>
