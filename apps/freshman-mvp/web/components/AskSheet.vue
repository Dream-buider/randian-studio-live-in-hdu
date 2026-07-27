<script setup lang="ts">
import { ref } from 'vue';
import type { QuestionContext } from '../api.js';

const props = defineProps<{
  context: QuestionContext;
}>();

const emit = defineEmits<{
  submit: [payload: { question: string; context: QuestionContext }];
  close: [];
}>();

const question = ref('');

function submit(): void {
  const normalized = question.value.trim();
  if (normalized) {
    emit('submit', { question: normalized, context: props.context });
  }
}
</script>

<template>
  <div class="modal-backdrop">
    <section
      class="ask-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-title"
      data-role="ask-sheet"
      tabindex="-1"
      @keydown.esc="$emit('close')"
    >
      <header>
        <div>
          <p class="eyebrow">继续提问</p>
          <h2 id="ask-title">你还想了解什么？</h2>
        </div>
        <button type="button" aria-label="关闭提问框" @click="$emit('close')">关闭</button>
      </header>
      <p class="context-line">正在参考：{{ context.question }}</p>
      <form @submit.prevent="submit">
        <label for="campus-question">你的校园问题</label>
        <textarea
          id="campus-question"
          v-model="question"
          aria-label="输入你的校园问题"
          rows="4"
          placeholder="例如：宿舍晚上几点熄灯？"
        />
        <button type="submit" :disabled="!question.trim()">发送问题</button>
      </form>
    </section>
  </div>
</template>
