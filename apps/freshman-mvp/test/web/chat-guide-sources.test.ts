// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import App from '../../web/App.vue';
import { createAppRouter } from '../../web/router.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('chat freshman guide sources', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('live-in-hdu:pending-question', JSON.stringify({
      requestId: 'guide-source-request',
      question: '宿舍和校园卡要怎么准备？',
      context: {
        intentId: null,
        question: '自由提问',
        category: null,
      },
      status: 'pending',
      result: null,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('separates, deduplicates and safely links freshman guide sources', async () => {
    const guideBase = 'https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      route: 'knowledge',
      trustStatus: 'knowledge',
      answer: '请先按指北完成报到准备。',
      sources: [{
        type: 'community',
        title: '杭电新生指北：报到准备',
        url: `${guideBase}#JDfOd4Qt1o5MirxLrh5cI4Z8nud`,
        updatedAt: '2026-08-10',
      }, {
        type: 'community',
        title: '杭电新生指北：宿舍生活',
        url: `${guideBase}#dormitory`,
        updatedAt: '2026-08-10',
      }, {
        type: 'community',
        title: '杭电新生指北：校园服务',
        url: `${guideBase}#campus-service`,
        updatedAt: '2026-08-10',
      }, {
        type: 'community',
        title: '杭电新生指北：报到准备',
        url: `${guideBase}#JDfOd4Qt1o5MirxLrh5cI4Z8nud`,
        updatedAt: '2026-08-10',
      }, {
        type: 'official',
        title: '杭电官网',
        url: 'https://www.hdu.edu.cn/',
        updatedAt: null,
      }],
    })));
    const router = createAppRouter(createMemoryHistory());
    await router.push('/chat');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.get('[aria-label="继续阅读《杭电新生指北》"]').findAll('a')).toHaveLength(3);
    expect(wrapper.get('a[href$="#JDfOd4Qt1o5MirxLrh5cI4Z8nud"]').attributes('target'))
      .toBe('_blank');
    expect(wrapper.get('[aria-label="参考资料"]').text()).toContain('杭电官网');
    expect(wrapper.get('[aria-label="参考资料"]').text()).not.toContain('杭电新生指北');
    expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
