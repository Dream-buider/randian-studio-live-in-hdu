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
    sources: [{
      type: 'official',
      title: '学校公开通知',
      url: 'https://www.hdu.edu.cn/news/example',
      updatedAt: '2025-08-20',
    }, {
      type: 'community',
      title: '杭电新生指北：开学准备',
      url: '',
      updatedAt: '2025-08-20',
    }, {
      type: 'student',
      title: '老生报到经验',
      url: '',
      updatedAt: '2025-08-20',
    }, {
      type: 'web',
      title: '不安全来源仍应显示为文本',
      url: 'javascript:alert(1)',
      updatedAt: null,
    }],
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
    if (url === '/api/health') {
      return jsonResponse({
        status: 'ok',
        components: {
          gateway: { status: 'healthy' },
          businessDatabase: { status: 'healthy', mode: 'sqlite' },
          tokenDance: {
            status: 'disabled',
            lastCallStatus: 'never',
            lastCallAt: null,
          },
          weknora: { status: 'not-configured' },
          embedding: { status: 'not-configured', mode: 'ollama' },
          search: {
            status: 'unavailable',
            mode: 'phase-a-disabled',
            lastSearchStatus: 'never',
            lastSearchAt: null,
          },
          reviewQueue: { status: 'ok', pending: 2 },
          integrationOutbox: {
            status: 'not-configured',
            pending: 3,
            failed: 1,
          },
        },
      });
    }
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
    if (url === '/api/admin/knowledge-imports') {
      return jsonResponse({
        configured: true,
        items: [{
          id: 'knowledge-import-1',
          itemPath: 'hdu-freshman-guide-2026.md',
          version: 1,
          contentSha256: 'a'.repeat(64),
          title: '杭电新生指北',
          sourceType: 'community',
          sourceUrl: 'https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd',
          publishedAt: '2026-07-30',
          applicableYear: 2026,
          approvedBy: 'project-owner',
          approvedAt: '2026-08-02T00:15:00+08:00',
          ingestMode: 'manual',
          knowledgeBaseId: 'kb-documents',
          weknoraKnowledgeId: 'weknora-guide-1',
          parseStatus: 'failed',
          lastError: '解析失败',
          createdAt: '2026-08-02T00:16:00+08:00',
          updatedAt: '2026-07-28T04:02:00.000Z',
        }],
      });
    }
    if (url === '/api/admin/knowledge-imports/knowledge-import-1/retry') {
      return jsonResponse({
        status: 'queued',
        item: { id: 'knowledge-import-1', parseStatus: 'pending' },
      });
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
    expect(wrapper.text()).toContain('请核对');
    expect(wrapper.text()).toContain('output/freshman-platform/import-report.json');
    expect(wrapper.text()).not.toContain('Task 8 完成后才会生成');
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

  it('shows honest component health without treating unavailable Phase B services as healthy', async () => {
    vi.stubGlobal('fetch', adminFetch());
    const wrapper = await mountAdmin();
    const health = wrapper.get('[data-role="service-health"]');

    expect(health.text()).toContain('服务状态');
    expect(health.text()).toContain('网关');
    expect(health.text()).toContain('正常');
    expect(health.text()).toContain('业务数据库');
    expect(health.text()).toContain('SQLite');
    expect(health.text()).toContain('TokenDance');
    expect(health.text()).toContain('未配置');
    expect(health.text()).toContain('WeKnora');
    expect(health.text()).toContain('联网搜索');
    expect(health.text()).toContain('Phase A 未启用');
    expect(health.text()).toContain('待审核 2');
    expect(health.text()).toContain('同步待处理 3');
    expect(health.text()).toContain('同步失败 1');
    expect(health.text()).not.toContain('API Key');
  });

  it('keeps content operations usable when only the health endpoint fails', async () => {
    const fallback = adminFetch();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/health') {
        return jsonResponse(
          { error: { code: 'UNAVAILABLE', message: 'health unavailable' } },
          { status: 503 },
        );
      }
      return fallback(input, init);
    }));
    const wrapper = await mountAdmin();

    expect(wrapper.get('[data-role="service-health"]').text()).toContain(
      '服务状态暂时无法读取',
    );
    expect(wrapper.text()).toContain('共 3 个问题意图');
    expect(wrapper.text()).not.toContain('管理数据暂时加载失败');
  });

  it('does not keep content operations loading while the health request is still pending', async () => {
    const fallback = adminFetch();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/health') {
        return new Promise<Response>(() => undefined);
      }
      return fallback(input, init);
    }));
    const wrapper = await mountAdmin();

    expect(wrapper.get('[data-role="service-health"]').text()).toContain(
      '正在读取服务状态',
    );
    expect(wrapper.text()).toContain('共 3 个问题意图');
    expect(wrapper.text()).not.toContain('正在加载管理数据');
  });

  it('shows traceable knowledge import details and retries a failed approved item', async () => {
    const records: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', adminFetch(records));
    const wrapper = await mountAdmin();

    expect(wrapper.text()).toContain('杭电新生指北');
    expect(wrapper.text()).toContain('community');
    expect(wrapper.text()).toContain('aaaaaaaaaaaa');
    expect(wrapper.text()).toContain('2026-08-02T00:15:00+08:00');
    expect(wrapper.text()).toContain('failed');
    const guideSource = wrapper.get(
      'a[href="https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd"]',
    );
    expect(guideSource.attributes('target')).toBe('_blank');
    expect(wrapper.text()).toContain('weknora-guide-1');
    expect(wrapper.text()).toContain('project-owner');
    expect(wrapper.text()).toContain('2026-08-02T00:16:00+08:00');
    expect(wrapper.text()).toContain('2026-07-28T04:02:00.000Z');
    await wrapper.get('[data-action="retry-knowledge-import"]').trigger('click');
    await flushPromises();

    const request = records.find(({ url }) => (
      url === '/api/admin/knowledge-imports/knowledge-import-1/retry'
    ));
    expect(request?.init?.method).toBe('POST');
  });

  it('marks only review rows without official or 新生指北 evidence as lacking HDU material', async () => {
    vi.stubGlobal('fetch', adminFetch());
    const wrapper = await mountAdmin();
    const rows = wrapper.findAll('[data-role="review-row"]');

    expect(rows[0].text()).toContain('杭电资料不足');
    expect(rows[1].text()).not.toContain('杭电资料不足');
  });

  it('keeps an unsafe knowledge import source URL as text instead of a link', async () => {
    const fallback = adminFetch();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/admin/knowledge-imports') {
        return jsonResponse({
          configured: true,
          items: [{
            id: 'unsafe-import',
            itemPath: 'unsafe.md',
            version: 1,
            contentSha256: 'b'.repeat(64),
            title: '不安全导入记录',
            sourceType: 'community',
            sourceUrl: 'javascript:alert(1)',
            publishedAt: '2026-07-30',
            applicableYear: 2026,
            approvedBy: 'project-owner',
            approvedAt: '2026-08-02T00:15:00+08:00',
            ingestMode: 'manual',
            knowledgeBaseId: 'kb-documents',
            weknoraKnowledgeId: null,
            parseStatus: 'validated',
            lastError: null,
            createdAt: '2026-08-02T00:16:00+08:00',
            updatedAt: '2026-08-02T00:16:00+08:00',
          }],
        });
      }
      return fallback(input, init);
    }));
    const wrapper = await mountAdmin();

    expect(wrapper.text()).toContain('原始来源：javascript:alert(1)');
    expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false);
  });

  it('ignores an older raw-answer response after the operator selects a different intent', async () => {
    let resolveDormitory!: (response: Response) => void;
    const slowDormitory = new Promise<Response>((resolve) => {
      resolveDormitory = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin/intents') {
        return jsonResponse({ items: intents });
      }
      if (url === '/api/reviews?status=pending') {
        return jsonResponse({ items: [] });
      }
      if (url.endsWith('/campus-card/raw-answers')) {
        return jsonResponse({ items: [] });
      }
      if (url.endsWith('/dormitory/raw-answers')) {
        return slowDormitory;
      }
      if (url.endsWith('/q11/raw-answers')) {
        return jsonResponse({ items: [] });
      }
      return jsonResponse({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    }));
    const wrapper = await mountAdmin();

    await wrapper.get('[data-intent-id="dormitory"]').trigger('click');
    await wrapper.get('[data-intent-id="q11"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Q11 按要求保持空白');

    resolveDormitory(jsonResponse({
      items: [{
        id: 'late-dormitory-answer',
        intentId: 'dormitory',
        answer: '这条慢响应绝不能覆盖 Q11。',
        sourceLabel: '回答（一）',
        sourceCell: 'E9',
        createdAt: '2026-07-28T00:00:00.000Z',
      }],
    }));
    await flushPromises();

    expect(wrapper.text()).toContain('Q11 按要求保持空白');
    expect(wrapper.text()).not.toContain('这条慢响应绝不能覆盖 Q11');
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

  it('refreshes the selected intent after publishing without submitting a second version', async () => {
    let workspaceReads = 0;
    let publishCalls = 0;
    const publishedDormitory = {
      ...intents[2],
      publishedAnswer: {
        id: 'dormitory',
        category: '校园生活',
        question: '宿舍条件怎么样？',
        summary: '宿舍条件会因校区与楼栋不同，入住安排请以学校当年通知为准。',
        fullAnswer: '滨江校区与下沙校区的宿舍条件不同，床位和设施以当年实际分配为准。',
        sources: [source],
        trustStatus: 'approved',
        updatedAt: '2026-07-28T02:00:00.000Z',
        featured: false,
        displayOrder: 8,
      },
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin/intents') {
        workspaceReads += 1;
        return jsonResponse({
          items: workspaceReads === 1
            ? intents
            : [intents[0], intents[1], publishedDormitory],
        });
      }
      if (url === '/api/reviews?status=pending') {
        return jsonResponse({ items: reviews });
      }
      if (url.endsWith('/raw-answers')) {
        return jsonResponse({ items: [] });
      }
      if (url.endsWith('/dormitory/publish')) {
        publishCalls += 1;
        return jsonResponse({
          id: 'dormitory:v1',
          intentId: 'dormitory',
          version: 1,
          status: 'published',
        });
      }
      return jsonResponse({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    }));
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
    await wrapper.get('[data-action="publish"]').trigger('click');
    await wrapper.get('[data-action="confirm-publish"]').trigger('click');
    await flushPromises();

    expect(publishCalls).toBe(1);
    expect(workspaceReads).toBe(2);
    expect(wrapper.get('[data-intent-id="dormitory"]').text()).toContain('已发布');
    expect(wrapper.get('.admin-editor .admin-status').text()).toBe('已发布');
    expect(wrapper.get('textarea[aria-label="简明答案"]').element).toHaveProperty(
      'value',
      publishedDormitory.publishedAnswer.summary,
    );
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

  it('labels review sources, exposes their types, and keeps unsafe URLs as text', async () => {
    vi.stubGlobal('fetch', adminFetch());
    const wrapper = await mountAdmin();
    const row = wrapper.findAll('[data-role="review-row"]')[1];

    expect(row.text()).toContain('参考资料');
    expect(row.text()).toContain('杭电官方');
    expect(row.text()).toContain('新生指北');
    expect(row.text()).toContain('社区经验');
    expect(row.text()).toContain('网络线索·待核验');
    expect(row.find('[data-source-type="official"]').exists()).toBe(true);
    expect(row.find('[data-source-type="community"]').exists()).toBe(true);
    expect(row.find('[data-source-type="student"]').exists()).toBe(true);
    expect(row.find('[data-source-type="web"]').exists()).toBe(true);
    expect(row.text()).toContain('www.hdu.edu.cn');
    expect(row.find('a[href^="javascript:"]').exists()).toBe(false);
    expect(row.get('a[href="https://www.hdu.edu.cn/news/example"]').attributes('target')).toBe('_blank');
  });

  it('removes a decided task from the pending queue and updates the count', async () => {
    const records: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', adminFetch(records));
    const wrapper = await mountAdmin();
    const first = wrapper.findAll('[data-role="review-row"]')[0];
    await first.get('textarea[aria-label="审核后答案"]').setValue('核对后的结构化回答');
    await first.get('input[aria-label="回流目标"]').setValue('community-knowledge');
    await first.get('input[aria-label="审核说明"]').setValue('已人工检查');
    await first.get('input[aria-label="审核人"]').setValue('local-admin');
    await first.get('button[aria-label="通过第 7 个未收录问题"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-role="review-row"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('1 条待处理');
    expect(wrapper.text()).not.toContain('第一个未收录问题');
    expect(
      records.filter(({ url }) => url.endsWith('/old-low-risk/decision')),
    ).toHaveLength(1);
  });

  it('opens an accessible publish confirmation and restores focus after Escape', async () => {
    vi.stubGlobal('fetch', adminFetch());
    const host = document.createElement('div');
    document.body.append(host);
    const router = createAppRouter(createMemoryHistory());
    await router.push('/admin');
    await router.isReady();
    const wrapper = mount(App, { attachTo: host, global: { plugins: [router] } });
    try {
      await flushPromises();
      await wrapper.get('[data-intent-id="dormitory"]').trigger('click');
      await flushPromises();
      await wrapper.get('textarea[aria-label="简明答案"]').setValue(
        '宿舍条件会因校区与楼栋不同，入住安排请以学校当年通知为准。',
      );
      await wrapper.get('textarea[aria-label="完整答案"]').setValue(
        '滨江校区与下沙校区的宿舍条件不同，床位和设施以当年实际分配为准。',
      );
      await wrapper.get('input[aria-label="来源标题"]').setValue('2025 年新生指北');
      const opener = wrapper.get('[data-action="publish"]').element as HTMLButtonElement;
      opener.focus();
      await wrapper.get('[data-action="publish"]').trigger('click');
      await flushPromises();

      const dialog = wrapper.get('[role="alertdialog"]');
      expect(dialog.attributes('aria-modal')).toBe('true');
      expect(dialog.element.contains(document.activeElement)).toBe(true);
      const cancel = dialog.get('button').element as HTMLButtonElement;
      const confirm = dialog.get('[data-action="confirm-publish"]').element as HTMLButtonElement;

      cancel.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
      expect(document.activeElement).toBe(confirm);

      confirm.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }));
      expect(document.activeElement).toBe(cancel);

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
      await flushPromises();
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
      expect(document.activeElement).toBe(opener);
    } finally {
      wrapper.unmount();
      host.remove();
    }
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
