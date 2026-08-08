<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { QuestionContext } from '../api.js';
import { useDialogFocus } from './use-dialog-focus.js';
import { useVisualViewport } from './use-visual-viewport.js';

const props = defineProps<{
  context: QuestionContext;
}>();

const emit = defineEmits<{
  submit: [payload: { question: string; context: QuestionContext }];
  close: [];
}>();

const question = ref('');
const panel = ref<HTMLElement | null>(null);
const { revealInput, viewportStyle } = useVisualViewport(panel);
let previousBodyStyle = '';
let previousScrollX = 0;
let previousScrollY = 0;

useDialogFocus(panel, '#campus-question', () => emit('close'));

onMounted(() => {
  previousBodyStyle = document.body.style.cssText;
  previousScrollX = window.scrollX;
  previousScrollY = window.scrollY;
  document.body.style.overflow = 'hidden';
});

onUnmounted(() => {
  document.body.style.cssText = previousBodyStyle;
  window.scrollTo(previousScrollX, previousScrollY);
});

function revealFocusedInput(event: FocusEvent): void {
  if (event.target instanceof HTMLElement) {
    revealInput(event.target);
  }
}

function submit(): void {
  const normalized = question.value.trim();
  if (normalized) {
    emit('submit', { question: normalized, context: props.context });
  }
}
</script>

<template>
  <div class="modal-backdrop" :style="viewportStyle">
    <section
      ref="panel"
      class="ask-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-title"
      data-role="ask-sheet"
      data-surface="cinematic-sheet"
      tabindex="-1"
    >
      <span class="sheet-grab-handle" aria-hidden="true" />
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
          @focus="revealFocusedInput"
        />
        <button type="submit" data-action="submit-question" :disabled="!question.trim()">发送问题</button>
      </form>
    </section>
  </div>
</template>
