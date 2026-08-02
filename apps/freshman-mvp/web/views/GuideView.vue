<script setup lang="ts">
import BrandHeader from '../components/BrandHeader.vue';
import {
  FRESHMAN_GUIDE_SECTIONS,
  FRESHMAN_GUIDE_UPDATED_AT,
} from '../../src/content/freshman-guide.js';
</script>

<template>
  <main class="guide-page">
    <header class="guide-page-header">
      <div>
        <BrandHeader subtitle="社区整理的新生入学指南" />
        <h1>杭电新生指北</h1>
        <p>按入学准备、住宿与日常校园生活快速找到对应信息。</p>
      </div>
      <RouterLink class="guide-return" to="/">返回问答</RouterLink>
    </header>

    <aside class="guide-disclaimer">
      社区成员整理，非杭州电子科技大学官方发布；请以学校最新通知为准。
    </aside>

    <section class="guide-section-list" aria-label="新生指南目录">
      <article v-for="section in FRESHMAN_GUIDE_SECTIONS" :key="section.id" class="guide-section-card">
        <h2>{{ section.title }}</h2>
        <p>{{ section.summary }}</p>
        <ul>
          <li v-for="topic in section.topics" :key="topic">{{ topic }}</li>
        </ul>
        <a :href="section.href" target="_blank" rel="noopener noreferrer">查看该节指北</a>
      </article>
    </section>

    <p class="guide-updated">目录来源：社区整理的《杭电新生指北》；更新于 {{ FRESHMAN_GUIDE_UPDATED_AT }}。</p>
  </main>
</template>
