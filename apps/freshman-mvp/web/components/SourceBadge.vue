<script setup lang="ts">
import type { TrustStatus } from '../api.js';

defineProps<{
  status: TrustStatus;
}>();

const labels: Record<TrustStatus, string> = {
  approved: '已审核标准答案',
  knowledge: '社区知识库',
  'web-unverified': '联网整理·注意甄别',
};
</script>

<template>
  <span class="trust-badge" :data-status="status">{{ labels[status] }}</span>
</template>
