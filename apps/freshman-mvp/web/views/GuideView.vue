<script setup lang="ts">
import BrandHeader from '../components/BrandHeader.vue';
import {
  FRESHMAN_GUIDE_SECTIONS,
  FRESHMAN_GUIDE_UPDATED_AT,
} from '../../src/content/freshman-guide.js';
</script>

<template>
  <main class="guide-page" data-theme="randian-dawn">
    <header class="guide-page-header">
      <div class="guide-signal-hero">
        <div class="guide-signal-copy">
          <BrandHeader subtitle="社区整理的新生入学指南" />
          <p class="signal-kicker">
            <span aria-hidden="true"></span>
            校园信号已接通
          </p>
          <h1>沿着信号，找到入学答案</h1>
          <p>{{ FRESHMAN_GUIDE_SECTIONS.length }}座信号站依次带你完成入学准备、安顿宿舍，再熟悉校园生活。</p>
        </div>
        <div class="signal-receiver" aria-hidden="true">
          <span class="receiver-ring receiver-ring-outer"></span>
          <span class="receiver-ring receiver-ring-inner"></span>
          <span class="receiver-core"></span>
          <span class="receiver-beam"></span>
        </div>
      </div>
      <RouterLink class="guide-return" :to="{ name: 'deck' }">返回问答</RouterLink>
    </header>

    <aside class="guide-disclaimer">
      <span aria-hidden="true">i</span>
      <p>社区成员整理，非杭州电子科技大学官方发布；请以学校最新通知为准。</p>
    </aside>

    <div class="guide-signal-route-wrap">
      <span class="signal-energy-pulse" aria-hidden="true" />
      <ol
        class="guide-signal-route"
        aria-label="新生指北信号站"
        data-energy="dawn"
        data-role="signal-route"
      >
        <li
          v-for="(section, index) in FRESHMAN_GUIDE_SECTIONS"
          :key="section.id"
          class="guide-signal-station"
          data-role="signal-station"
        >
          <div class="signal-node" aria-hidden="true">
            <span data-role="station-index">{{ String(index + 1).padStart(2, '0') }}</span>
          </div>
          <article class="signal-panel">
            <div class="signal-panel-meta">
              <span>第 {{ String(index + 1).padStart(2, '0') }} 站</span>
              <span class="signal-status"><i aria-hidden="true"></i>信号稳定</span>
            </div>
            <h2>{{ section.title }}</h2>
            <p>{{ section.summary }}</p>
            <ul>
              <li v-for="topic in section.topics" :key="topic">{{ topic }}</li>
            </ul>
            <a :href="section.href" target="_blank" rel="noopener noreferrer">
              接收「{{ section.title }}」完整信号
              <span aria-hidden="true">↗</span>
            </a>
          </article>
        </li>
      </ol>
    </div>

    <p class="guide-updated">目录来源：社区整理的《杭电新生指北》；更新于 {{ FRESHMAN_GUIDE_UPDATED_AT }}。</p>
  </main>
</template>
