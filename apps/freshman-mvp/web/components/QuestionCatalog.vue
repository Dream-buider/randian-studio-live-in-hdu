<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PublishedQuestion } from '../api.js';
import { useDialogFocus } from './use-dialog-focus.js';

const props = defineProps<{
  questions: PublishedQuestion[];
}>();

const emit = defineEmits<{
  select: [id: string];
  close: [];
}>();
const panel = ref<HTMLElement | null>(null);

useDialogFocus(panel, '[data-question-id]', () => emit('close'));

const groups = computed(() => {
  const result = new Map<string, PublishedQuestion[]>();
  for (const question of props.questions) {
    const group = result.get(question.category) ?? [];
    group.push(question);
    result.set(question.category, group);
  }
  return [...result.entries()];
});
</script>

<template>
  <div class="modal-backdrop">
    <section
      ref="panel"
      class="catalog-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-title"
      data-role="question-catalog"
      tabindex="-1"
    >
      <header>
        <h2 id="catalog-title">全部问题</h2>
        <button type="button" aria-label="关闭全部问题" @click="$emit('close')">关闭</button>
      </header>
      <section v-for="[category, items] in groups" :key="category" class="catalog-group">
        <h3>{{ category }}</h3>
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          :data-question-id="item.id"
          @click="$emit('select', item.id)"
        >
          {{ item.question }}
        </button>
      </section>
    </section>
  </div>
</template>
