<script setup lang="ts">
defineProps<{ subtitle: string }>();

const logoSrc = '/brand/randian-studio-logo.png';
</script>

<template>
  <header class="brand-header" data-role="brand-header">
    <img :src="logoSrc" alt="燃点工作室">
    <div>
      <strong>LIVE IN HDU</strong>
      <span>{{ subtitle }}</span>
    </div>
  </header>
</template>
