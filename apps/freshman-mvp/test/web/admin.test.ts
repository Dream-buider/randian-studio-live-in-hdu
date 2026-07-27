// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import App from '../../web/App.vue';
import { createAppRouter } from '../../web/router.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const source = {
  type: 'community',
  title: '2025 年新生指北',
  url: '',
  updatedAt: '2025-08-20',
};

const intents = [
  {
    id: 'campus-card',
    externalId: 'Q01',
    category: '校园生活',
    question: '校园卡怎么办理？',
    intentDescription: '校园卡领取与激活',
    aliases: ['学校怎么办校园卡'],
    keywords: ['校园卡'],
    excludeKeywords: [],
    active: true,
    featured: true,
    displayOrder: 1,
    rawAnswerCount: 1,
    publishedAnswer: {
      id: 'campus-card',
      category: '校园生活',
      question: '校园卡怎么办理？',
      summary: '到校后请按照学院通知领取校园卡，并及时完成激活和密码修改。',
      fullAnswer: '具体领取地点和时间以当年学院通知为准。',
      sources: [source],
      trustStatus: 'approved',
      updatedAt: '2026-07-28T00:00:00.000Z',
      featured: true,
      displayOrder: 1,
    },
  },
  {
    id: 'q11',
    externalId: 'Q11',
    category: '学业发展',
    question: 'Q11 暂留问题',
    intentDescription: '按项目要求保留空白',
    aliases: [],
    keywords: [],
    excludeKeywords: [],
    active: true,
    featured: false,
    displayOrder: 11,
    rawAnswerCount: 0,
    publishedAnswer: null,
  },
  {
    id: 'dormitory',
    externalId: 'Q08',
    category: '校园生活',
    question: '宿舍条件怎么样？',
    intentDescription: '校区宿舍条件',
    aliases: [],
    keywords: ['宿舍'],
    excludeKeywords: [],
    active: true,
    featured: false,
    displayOrder: 8,
    rawAnswerCount: 1,
    publishedAnswer: null,
  },
];

const reviews = [
  {
    id: 'old-low-risk',
    question: '第一个未收录问题',
    answer: '第一条临时回答',
    sources: [],
    riskLevel: 'low',
    status: 'pending',
    ordinal: 7,
    createdAt: '2026-07-28T00:00:00.000Z',
    decidedAt: null,
    reviewerId: null,
    decisionNote: null,
    reviewedAnswer: null,
    feedbackTarget: null,
  },
  {
    id: 'new-high-risk',
    question: '第二个未收录问题',
    answer: '第二条临时回答',
    sources: [source],
    riskLevel: 'high',
    status: 'pending',
    ordinal: 12,
    createdAt: '2026-07-28T01:00:00.000Z',
    decidedAt: null,
    reviewerId: null,
    decisionNote: null,
    reviewedAnswer: null,
    feedbackTarget: null,
  },
];

function adminFetch(records: Array<{ url: string; init?: RequestInit }> = []) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    records.push({ url, init });
    if (url === '/api/admin/intents') {
      return jsonResponse({ items: intents });
    }
    if (url.endsWith('/raw-answers')) {
      const intentId = url.split('/').at(-2);
      return jsonResponse({
        items: intentId === 'dormitory'
          ? [{
            id: 'raw-q08-e9',
            intentId: 'dormitory',
            answer: '六人间为主，具体以当年安排为准。',
            sourceLabel: '回答（一）',
            sourceCell: 'E9',
            createdAt: '2026-07-28T00:00:00.000Z',
          }]
          : [],
      });
    }
    if (url === '/api/reviews?status=pending') {
      return jsonResponse({ items: reviews });
    }
    if (url.includes('/publish')) {
      return jsonResponse({
        id: 'dormitory:v1',
        intentId: 'dormitory',
        version: 1,
        status: 'published',
      });
    }
    if (url.includes('/decision')) {
      return jsonResponse({ item: { ...reviews[0], status: 'approved' } });
    }
    return jsonResponse({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  });
}

async function mountAdmin() {
  const router = createAppRouter(createMemoryHistory());
  await router.push('/admin');
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

describe('operations console', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads dynamic intents and keeps Q11 visibly empty without inventing import counts', async () => {
    vi.stubGlobal('fetch', adminFetch());
    const wrapper = await mountAdmin();

    expect(wrapper.text()).toContain('内容与审核控制台');
    expect(wrapper.text()).toContain('共 3 个问题意图');
    expect(wrapper.text()).not.toContain('共 35 个问题意图');
    expect(wrapper.text()).toContain('最新导入报告');
    expect(wrapper.text()).not.toMatch(/拒绝\s*\d+/);
    expect(wrapper.text()).toContain('Q11 暂留问题');
    await wrapper.get('[data-intent-id="q11"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('待整理');
    expect(wrapper.text()).toContain('Q11 按要求保持空白，暂不提供自动填充');
    expect(wrapper.find('[data-action="publish"]').exists()).toBe(false);

    await wrapper.get('[data-intent-id="dormitory"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('原始回答（未发布）');
    expect(wrapper.text()).toContain('六人间为主');
    expect(wrapper.text()).toContain('回答（一）');
    expect(wrapper.text()).toContain('E9');
    expect(wrapper.html()).not.toContain('v-html');
  });

  it('counts trimmed Unicode code points and requires full answer and a source before publish', async () => {
    vi.stubGlobal('fetch', adminFetch());
    const wrapper = await mountAdmin();
    await wrapper.get('[data-intent-id="dormitory"]').trigger('click');
    await flushPromises();

    const summary = wrapper.get('textarea[aria-label="简明答案"]');
    const fullAnswer = wrapper.get('textarea[aria-label="完整答案"]');
    const sourceTitle = wrapper.get('input[aria-label="来源标题"]');
    const publish = wrapper.get('[data-action="publish"]');

    await summary.setValue(` ${'新'.repeat(19)}😀 `);
    expect(wrapper.get('[data-role="summary-count"]').text()).toContain('20 / 150');
    expect(publish.attributes()).toHaveProperty('disabled');
    await fullAnswer.setValue('宿舍条件会因校区和楼栋不同，请以当年学校安排为准。');
    await sourceTitle.setValue('2025 年新生指北');
    expect(publish.attributes()).not.toHaveProperty('disabled');

    await summary.setValue('新'.repeat(19));
    expect(wrapper.get('[data-role="summary-count"]').text()).toContain('19 / 150');
    expect(publish.attributes()).toHaveProperty('disabled');
    await summary.setValue('新'.repeat(151));
    expect(wrapper.get('[data-role="summary-count"]').text()).toContain('151 / 150');
    expect(publish.attributes()).toHaveProperty('disabled');
  });

  it('publishes an explicit new version with the exact payload and confirmation feedback', async () => {
    const records: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', adminFetch(records));
    const wrapper = await mountAdmin();
    await wrapper.get('[data-intent-id="dormitory"]').trigger('click');
    await flushPromises();

    await wrapper.get('textarea[aria-label="简明答案"]').setValue(
      '宿舍条件会因校区与楼栋不同，入住安排请以学校当年通知为准。',
    );
    await wrapper.get('textarea[aria-label="完整答案"]').setValue(
      '滨江校区与下沙校区的宿舍条件不同，床位和设施以当年实际分配为准。',
    );
    await wrapper.get('input[aria-label="来源标题"]').setValue('2025 年新生指北');
    await wrapper.get('input[aria-label="审核人"]').setValue('local-admin');
    await wrapper.get('[data-action="publish"]').trigger('click');
    expect(records.some(({ url }) => url.endsWith('/dormitory/publish'))).toBe(false);
    expect(wrapper.text()).toContain('确认后将创建新版本，旧版本会保留');
    await wrapper.get('[data-action="confirm-publish"]').trigger('click');
    await flushPromises();

    const request = records.find(({ url }) => url.endsWith('/dormitory/publish'));
    expect(request?.init?.method).toBe('POST');
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      summary: '宿舍条件会因校区与楼栋不同，入住安排请以学校当年通知为准。',
      fullAnswer: '滨江校区与下沙校区的宿舍条件不同，床位和设施以当年实际分配为准。',
      sources: [{
        type: 'community',
        title: '2025 年新生指北',
        url: '',
        updatedAt: null,
      }],
      reviewerId: 'local-admin',
    });
    expect(wrapper.text()).toContain('已创建第 1 个发布版本');
    expect(wrapper.text()).toContain('旧版本未被覆盖');
  });

  it.each([
    ['approved', '通过'],
    ['rejected', '驳回'],
    ['needs_more', '需补充'],
  ] as const)('keeps FIFO server order and sends exact %s decision payload', async (status, actionLabel) => {
    const records: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', adminFetch(records));
    const wrapper = await mountAdmin();
    const rows = wrapper.findAll('[data-role="review-row"]');

    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('第 7 个未收录');
    expect(rows[0].text()).toContain('第一个未收录问题');
    expect(rows[1].text()).toContain('第 12 个未收录');
    expect(rows[1].text()).toContain('第二个未收录问题');
    expect(rows[1].text()).toContain('high');

    await rows[0].get('textarea[aria-label="审核后答案"]').setValue('核对后的结构化回答');
    await rows[0].get('input[aria-label="回流目标"]').setValue('community-knowledge');
    await rows[0].get('input[aria-label="审核说明"]').setValue('已人工检查');
    await rows[0].get('input[aria-label="审核人"]').setValue('local-admin');
    await rows[0].get(`button[aria-label="${actionLabel}第 7 个未收录问题"]`).trigger('click');
    await flushPromises();

    const request = records.find(({ url }) => url.endsWith('/old-low-risk/decision'));
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      status,
      reviewerId: 'local-admin',
      note: '已人工检查',
      reviewedAnswer: status === 'rejected' ? null : '核对后的结构化回答',
      feedbackTarget: 'community-knowledge',
    });
  });

  it('shows the local-only message for a 403 without suggesting a bypass', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      { error: { code: 'FORBIDDEN', message: 'Local access only' } },
      { status: 403 },
    )));
    const wrapper = await mountAdmin();
    expect(wrapper.text()).toContain('管理端仅允许在本机打开');
    expect(wrapper.text()).not.toMatch(/X-Forwarded|关闭防护|绕过/);
  });
});
