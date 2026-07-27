// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import type { PublishedQuestion } from '../../web/api.js';
import App from '../../web/App.vue';
import { createAppRouter } from '../../web/router.js';
import QuestionDeckView from '../../web/views/QuestionDeckView.vue';

const questions: PublishedQuestion[] = Array.from({ length: 12 }, (_, index) => ({
  id: `question-${index + 1}`,
  category: index < 4 ? '报到准备' : index < 8 ? '校园生活' : '学业发展',
  question: `第 ${index + 1} 个新生问题是什么？`,
  summary: `这是第 ${index + 1} 个问题的简明回答，帮助新生快速理解当前事项。`,
  fullAnswer: `这是第 ${index + 1} 个问题的完整回答，包含需要注意的具体安排和核验方式。`,
  sources: [{
    type: 'community',
    title: `新生指北第 ${index + 1} 节`,
    url: '',
    updatedAt: '2026-07-28',
  }],
  trustStatus: 'approved',
  updatedAt: '2026-07-28T00:00:00.000Z',
  featured: index === 4,
  displayOrder: index + 1,
}));

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('question deck', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: questions })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the dynamic total, first card, approved trust and next card in server order', async () => {
    const wrapper = mount(QuestionDeckView);
    await flushPromises();

    expect(wrapper.text()).toContain('新生必看 12 问');
    expect(wrapper.text()).toContain('01 / 12');
    expect(wrapper.text()).toContain('第 1 个新生问题是什么？');
    expect(wrapper.text()).toContain('展开完整回答');
    expect(wrapper.text()).toContain('已审核标准答案');
    expect(wrapper.text()).toContain('新生指北第 1 节');
    expect(wrapper.text()).toContain('更新于 2026-07-28');
    expect(wrapper.text()).toContain('信息过时？告诉我们');

    await wrapper.get('[data-action="next"]').trigger('click');

    expect(wrapper.text()).toContain('02 / 12');
    expect(wrapper.text()).toContain('第 2 个新生问题是什么？');
  });

  it('moves both directions and expands only the current complete answer', async () => {
    const wrapper = mount(QuestionDeckView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('包含需要注意的具体安排');
    await wrapper.get('[data-action="expand"]').trigger('click');
    expect(wrapper.text()).toContain('包含需要注意的具体安排');
    expect(wrapper.get('[data-action="expand"]').text()).toBe('收起完整回答');

    await wrapper.get('[data-action="next"]').trigger('click');
    expect(wrapper.text()).toContain('02 / 12');
    await wrapper.get('[data-action="previous"]').trigger('click');
    expect(wrapper.text()).toContain('01 / 12');
  });

  it('restores and persists a question ID instead of an array position', async () => {
    localStorage.setItem('live-in-hdu:current-question-id', 'question-7');
    const wrapper = mount(QuestionDeckView);
    await flushPromises();

    expect(wrapper.text()).toContain('07 / 12');
    expect(wrapper.text()).toContain('第 7 个新生问题是什么？');

    await wrapper.get('[data-action="next"]').trigger('click');
    expect(localStorage.getItem('live-in-hdu:current-question-id')).toBe('question-8');
  });

  it('groups the catalog by returned category and jumps directly to a selected ID', async () => {
    const wrapper = mount(QuestionDeckView);
    await flushPromises();

    await wrapper.get('[data-action="catalog"]').trigger('click');
    const catalog = wrapper.get('[data-role="question-catalog"]');
    expect(catalog.attributes('role')).toBe('dialog');
    expect(catalog.text()).toContain('报到准备');
    expect(catalog.text()).toContain('校园生活');
    expect(catalog.text()).toContain('学业发展');

    await catalog.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-role="question-catalog"]').exists()).toBe(false);
    await wrapper.get('[data-action="catalog"]').trigger('click');
    await wrapper.get('[data-question-id="question-10"]').trigger('click');
    expect(wrapper.text()).toContain('10 / 12');
    expect(wrapper.text()).toContain('第 10 个新生问题是什么？');
    expect(wrapper.find('[data-role="question-catalog"]').exists()).toBe(false);
  });

  it('uses a 50px horizontal touch threshold without moving on a short gesture', async () => {
    const wrapper = mount(QuestionDeckView);
    await flushPromises();
    const surface = wrapper.get('[data-role="deck-surface"]');

    await surface.trigger('touchstart', { touches: [{ clientX: 300 }] });
    await surface.trigger('touchend', { changedTouches: [{ clientX: 265 }] });
    expect(wrapper.text()).toContain('01 / 12');

    await surface.trigger('touchstart', { touches: [{ clientX: 300 }] });
    await surface.trigger('touchend', { changedTouches: [{ clientX: 200 }] });
    expect(wrapper.text()).toContain('02 / 12');

    await surface.trigger('touchstart', { touches: [{ clientX: 100 }] });
    await surface.trigger('touchend', { changedTouches: [{ clientX: 190 }] });
    expect(wrapper.text()).toContain('01 / 12');
  });

  it('opens an accessible ask sheet, closes with Escape, and keeps current context in chat', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/questions') {
        return jsonResponse({ items: questions });
      }
      const payload = JSON.parse(String(init?.body)) as {
        question?: string;
        context?: { intentId?: string };
      };
      if (payload.question !== '宿舍晚上几点熄灯？' || payload.context?.intentId !== 'question-4') {
        return jsonResponse({ error: { code: 'BAD_CONTEXT' } }, { status: 400 });
      }
      return jsonResponse({
        route: 'knowledge',
        trustStatus: 'knowledge',
        answer: '社区资料建议以当年宿管通知为准。',
        sources: [{
          type: 'community',
          title: '宿舍生活说明',
          url: '',
          updatedAt: '2026-07-28',
        }],
      });
    }));
    const router = createAppRouter(createMemoryHistory());
    await router.push('/');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    for (let index = 0; index < 3; index += 1) {
      await wrapper.get('[data-action="next"]').trigger('click');
    }
    await wrapper.get('[data-action="ask"]').trigger('click');
    const sheet = wrapper.get('[data-role="ask-sheet"]');
    expect(sheet.attributes('role')).toBe('dialog');
    expect(sheet.text()).toContain('正在参考：第 4 个新生问题是什么？');

    await sheet.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-role="ask-sheet"]').exists()).toBe(false);

    await wrapper.get('[data-action="ask"]').trigger('click');
    await wrapper.get('textarea[aria-label="输入你的校园问题"]').setValue('宿舍晚上几点熄灯？');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/chat');
    expect(wrapper.text()).toContain('参考问题');
    expect(wrapper.text()).toContain('第 4 个新生问题是什么？');
    expect(wrapper.text()).toContain('社区资料建议以当年宿管通知为准。');
    expect(wrapper.text()).toContain('社区知识库');
    expect(wrapper.text()).toContain('宿舍生活说明');

    await wrapper.get('[data-action="return-deck"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
    expect(wrapper.text()).toContain('04 / 12');
  });

  it('shows an honest empty state and still lets a user ask a free question', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [] })));
    const wrapper = mount(QuestionDeckView);
    await flushPromises();

    expect(wrapper.text()).toContain('暂时还没有已审核并发布的问题');
    expect(wrapper.text()).toContain('没有解决我的问题，直接提问');
    expect(wrapper.find('.question-card').exists()).toBe(false);

    await wrapper.get('[data-action="ask"]').trigger('click');
    expect(wrapper.get('[data-role="ask-sheet"]').text()).toContain('自由提问');
  });

  it('turns non-JSON and malformed question responses into a readable retry state', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }))
      .mockResolvedValueOnce(jsonResponse({ items: questions }));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(QuestionDeckView);
    await flushPromises();

    expect(wrapper.text()).toContain('问题列表暂时加载失败');
    expect(wrapper.text()).not.toContain('bad gateway');

    await wrapper.get('[data-action="retry-questions"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('新生必看 12 问');
    expect(wrapper.text()).toContain('01 / 12');
  });

  it('shows chat loading and retries a malformed answer envelope without leaking it', async () => {
    sessionStorage.setItem('live-in-hdu:pending-question', JSON.stringify({
      question: '一个未命中的问题',
      context: {
        intentId: 'question-2',
        question: '第 2 个新生问题是什么？',
        category: '报到准备',
      },
    }));
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => await firstResponse)
      .mockResolvedValueOnce(jsonResponse({
        route: 'preset',
        trustStatus: 'approved',
        answer: '已审核的补充回答。',
        sources: [],
        intentId: 'question-2',
      }));
    vi.stubGlobal('fetch', fetchMock);
    const router = createAppRouter(createMemoryHistory());
    await router.push('/chat');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });

    expect(wrapper.text()).toContain('正在整理回答');
    resolveFirst(jsonResponse({
      route: 'web',
      trustStatus: 'web-unverified',
      answer: 'provider-secret-diagnostic',
      sources: [],
      disclaimer: '错误的批注',
      reviewOrdinal: 1,
    }));
    await flushPromises();

    expect(wrapper.text()).toContain('回答暂时加载失败');
    expect(wrapper.text()).not.toContain('provider-secret-diagnostic');
    await wrapper.get('[data-action="retry-answer"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('已审核的补充回答。');
    expect(wrapper.text()).toContain('已审核标准答案');
  });

  it('renders the exact stage-3 disclaimer and treats answer markup as plain text', async () => {
    sessionStorage.setItem('live-in-hdu:pending-question', JSON.stringify({
      question: '学校附近哪里可以补办材料？',
      context: {
        intentId: null,
        question: '自由提问',
        category: null,
      },
    }));
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      route: 'web',
      trustStatus: 'web-unverified',
      answer: '<img src=x onerror=alert(1)>请以学校最新通知为准。',
      sources: [{
        type: 'web',
        title: '<strong>学校公开通知</strong>',
        url: 'https://example.test/notice',
        updatedAt: null,
      }, {
        type: 'web',
        title: '不安全来源仍应显示为文本',
        url: 'javascript:alert(1)',
        updatedAt: null,
      }],
      disclaimer: '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别',
      reviewOrdinal: 7,
    })));
    const router = createAppRouter(createMemoryHistory());
    await router.push('/chat');
    await router.isReady();
    const wrapper = mount(App, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>请以学校最新通知为准。');
    expect(wrapper.text()).toContain('<strong>学校公开通知</strong>');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('strong').exists()).toBe(false);
    expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('不安全来源仍应显示为文本');
    expect(wrapper.text()).toContain('联网整理·注意甄别');
    expect(wrapper.text()).toContain('该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别');
  });
});
