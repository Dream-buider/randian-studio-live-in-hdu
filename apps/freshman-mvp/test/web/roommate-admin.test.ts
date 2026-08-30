// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiResponseError,
  listAdminRoommates,
  moderateRoommate,
  revealRoommateContact,
} from '../../web/api.js';
import AdminRoommatePanel from '../../web/components/AdminRoommatePanel.vue';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const older = {
  id: 'registration-old',
  address: {
    campus: 'xiasha',
    templateVersion: 'xiasha-v1',
    building: '11',
    orientation: 'south',
    room: '207',
    bed: null,
    canonical: 'xiasha|xiasha-v1|11|south|207',
    display: '下沙校区 · 11号楼 · 南 · 207',
  },
  nickname: '小火苗',
  contact: { type: 'wechat', masked: true },
  status: 'active',
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
  expiresAt: '2026-11-08T08:00:00.000Z',
  deletedAt: null,
  lastModeration: null,
};

const newer = {
  ...older,
  id: 'registration-new',
  nickname: '新同学',
  contact: null,
  status: 'hidden',
  createdAt: '2026-08-11T08:00:00.000Z',
  updatedAt: '2026-08-11T09:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('roommate admin API boundary', () => {
  it('sends exact filters and returns only validated masked records', async () => {
    const fetch = vi.fn(async () => jsonResponse({ items: [older] }));
    vi.stubGlobal('fetch', fetch);

    await expect(listAdminRoommates({
      campus: 'xiasha',
      status: 'active',
      building: '011',
      orientation: 'south',
      room: '0207',
    })).resolves.toEqual([{ ...older, contacts: [{ type: 'wechat', masked: true }] }]);
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/roommates?campus=xiasha&status=active&building=011&orientation=south&room=0207',
    );
  });

  it('rejects an admin payload containing hidden credential or digest fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      items: [{ ...older, managementCodeDigest: 'must-not-cross-boundary' }],
    })));

    await expect(listAdminRoommates({})).rejects.toBeInstanceOf(ApiResponseError);
  });

  it('requires nullable moderation metadata and rejects array enum coercion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      items: [{
        ...older,
        lastModeration: {
          actorId: 'local-admin',
          action: ['hide'],
          reason: '数组不能伪装成枚举',
          createdAt: '2026-08-11T09:00:00.000Z',
        },
      }],
    })));
    await expect(listAdminRoommates({})).rejects.toBeInstanceOf(ApiResponseError);

    const { lastModeration: _required, ...missingMetadata } = older;
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [missingMetadata] })));
    await expect(listAdminRoommates({})).rejects.toBeInstanceOf(ApiResponseError);
  });

  it('sends only action and trimmed reason while keeping actor server-controlled', async () => {
    let sentInit: RequestInit | undefined;
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentInit = init;
      return jsonResponse({ item: { ...older, status: 'hidden' } });
    });
    vi.stubGlobal('fetch', fetch);

    await moderateRoommate('registration-old', 'hide', '  疑似错误寝室信息  ');
    expect(JSON.parse(String(sentInit?.body))).toEqual({
      action: 'hide',
      reason: '疑似错误寝室信息',
    });
    expect(JSON.parse(String(sentInit?.body))).not.toHaveProperty('actorId');
  });
});

describe('AdminRoommatePanel', () => {
  it('renders newest first, keeps contacts masked, and applies exact-address filters', async () => {
    const records: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      records.push(String(input));
      return jsonResponse({ items: [older, newer] });
    }));
    const wrapper = mount(AdminRoommatePanel);
    await flushPromises();

    const rows = wrapper.findAll('[data-role="roommate-admin-row"]');
    expect(rows.map((row) => row.attributes('data-registration-id'))).toEqual([
      'registration-new',
      'registration-old',
    ]);
    expect(wrapper.text()).toContain('微信（已脱敏）');
    expect(wrapper.text()).not.toContain('wx-secret-207');

    await wrapper.get('select[aria-label="校区筛选"]').setValue('xiasha');
    await wrapper.get('select[aria-label="状态筛选"]').setValue('active');
    const building = wrapper.get('select[aria-label="楼栋筛选"]');
    expect(building.findAll('option')).toHaveLength(41);
    await building.setValue('11');
    const orientation = wrapper.get('select[aria-label="方位筛选"]');
    expect(orientation.findAll('option').map((option) => option.attributes('value')))
      .toEqual(['', 'east', 'south', 'west', 'north', 'unknown']);
    await orientation.setValue('south');
    await wrapper.get('input[aria-label="寝室筛选"]').setValue('0207');
    await wrapper.get('form[data-role="roommate-admin-filters"]').trigger('submit');
    await flushPromises();

    expect(records.at(-1)).toBe(
      '/api/admin/roommates?campus=xiasha&status=active&building=11&orientation=south&room=0207',
    );
  });

  it('requires a nonblank reason before revealing or moderating sensitive data', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/roommates') {
        return jsonResponse({ items: [older] });
      }
      return jsonResponse({ error: { code: 'UNEXPECTED_REQUEST' } }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetch);
    const wrapper = mount(AdminRoommatePanel);
    await flushPromises();

    await wrapper.get('[data-action="reveal-roommate-contact"]').trigger('click');
    await wrapper.get('[data-action="hide-roommate"]').trigger('click');
    expect(wrapper.text()).toContain('请先填写操作原因');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reveals deliberately without browser caching and refreshes after moderation', async () => {
    let listCalls = 0;
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url === '/api/admin/roommates') {
        listCalls += 1;
        return jsonResponse({ items: [older] });
      }
      if (url.endsWith('/reveal-contact')) {
        return jsonResponse({
          contact: { type: 'wechat', value: 'wx-secret-207' },
          lastModeration: {
            actorId: 'local-admin',
            action: 'view_contact',
            reason: '人工核对异常',
            createdAt: '2026-08-11T09:30:00.000Z',
          },
        });
      }
      if (url.endsWith('/moderate')) {
        return jsonResponse({ item: { ...older, status: 'hidden' } });
      }
      return jsonResponse({}, { status: 404 });
    }));
    const wrapper = mount(AdminRoommatePanel);
    await flushPromises();
    await wrapper.get('input[aria-label="registration-old 的操作原因"]').setValue('人工核对异常');

    await wrapper.get('[data-action="reveal-roommate-contact"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('wx-secret-207');
    expect(wrapper.text()).toContain('local-admin · 查看完整联系方式');
    expect(wrapper.text()).toContain('人工核对异常');
    expect(requests.find(({ url }) => url.endsWith('/reveal-contact'))?.body).toEqual({
      reason: '人工核对异常',
    });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    await wrapper.get('[data-action="hide-roommate"]').trigger('click');
    await flushPromises();
    expect(requests.find(({ url }) => url.endsWith('/moderate'))?.body).toEqual({
      action: 'hide',
      reason: '人工核对异常',
    });
    expect(listCalls).toBe(2);
    expect(wrapper.text()).not.toContain('wx-secret-207');
  });

  it('offers restore and delete for hidden records and shows the safe local-only 403 copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      { error: { code: 'FORBIDDEN', message: 'Local access only' } },
      { status: 403 },
    )));
    const wrapper = mount(AdminRoommatePanel);
    await flushPromises();

    expect(wrapper.text()).toContain('仅允许在本机打开');
    expect(wrapper.text()).not.toMatch(/X-Forwarded|关闭防护|绕过/);

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [newer] })));
    const hiddenWrapper = mount(AdminRoommatePanel);
    await flushPromises();
    expect(hiddenWrapper.find('[data-action="restore-roommate"]').exists()).toBe(true);
    expect(hiddenWrapper.find('[data-action="delete-roommate"]').exists()).toBe(true);
  });
});
