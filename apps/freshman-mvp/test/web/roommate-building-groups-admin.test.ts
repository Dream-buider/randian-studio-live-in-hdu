// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiResponseError,
  deleteAdminRoommateBuildingGroup,
  listAdminRoommateBuildingGroups,
  putAdminRoommateBuildingGroup,
} from '../../web/api.js';
import AdminRoommateBuildingGroups from '../../web/components/AdminRoommateBuildingGroups.vue';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const pngBase64 = 'iVBORw0KGgo=';
const jpegBase64 = '/9j/2Q==';
const wireItem = {
  campus: 'xiasha',
  building: '15',
  imageMime: 'image/png',
  imageSha256: 'a'.repeat(64),
  imageSize: 8,
  updatedAt: '2026-08-29T12:00:00.000Z',
  updatedBy: 'local-admin',
  imageUrl: '/api/admin/roommate-building-groups/xiasha/15/image',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('building-group admin API boundary', () => {
  it('projects the exact server DTO and rejects extra fields or arbitrary image URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [wireItem] })));
    await expect(listAdminRoommateBuildingGroups()).resolves.toEqual([{
      campus: 'xiasha',
      building: '15',
      imageMime: 'image/png',
      imageSize: 8,
      updatedAt: '2026-08-29T12:00:00.000Z',
      imageUrl: '/api/admin/roommate-building-groups/xiasha/15/image',
    }]);

    for (const item of [
      { ...wireItem, imageUrl: 'https://evil.example/qr.png' },
      { ...wireItem, imageBase64: pngBase64 },
      { ...wireItem, imageSha256: 'not-a-sha256' },
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [item] })));
      await expect(listAdminRoommateBuildingGroups()).rejects.toBeInstanceOf(ApiResponseError);
    }
  });

  it('sends pure base64 for PNG/JPEG and validates the delete response', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      if (init?.method === 'PUT') {
        return jsonResponse({ ...wireItem, imageMime: 'image/jpeg', imageSize: 4 });
      }
      return jsonResponse({ status: 'deleted' });
    }));

    await putAdminRoommateBuildingGroup('xiasha', '015', {
      mimeType: 'image/jpeg',
      imageBase64: jpegBase64,
    });
    await expect(deleteAdminRoommateBuildingGroup('xiasha', '015')).resolves.toBe('deleted');

    expect(requests[0]?.url).toBe('/api/admin/roommate-building-groups/xiasha/15');
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      mimeType: 'image/jpeg',
      imageBase64: jpegBase64,
    });
    expect(String(requests[0]?.init?.body)).not.toContain('data:image');
    expect(requests[1]).toMatchObject({
      url: '/api/admin/roommate-building-groups/xiasha/15',
      init: { method: 'DELETE' },
    });
  });

  it('rejects invalid uploads before sending a request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(putAdminRoommateBuildingGroup('xiasha', '15', {
      mimeType: 'image/png', imageBase64: 'not base64',
    })).rejects.toBeInstanceOf(ApiResponseError);
    await expect(putAdminRoommateBuildingGroup('xiasha', '15', {
      mimeType: 'image/png', imageBase64: 'A'.repeat(1_398_104),
    })).rejects.toBeInstanceOf(ApiResponseError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('AdminRoommateBuildingGroups', () => {
  it('lists current configuration and previews only the selected image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [wireItem] })));
    const wrapper = mount(AdminRoommateBuildingGroups);
    await flushPromises();

    expect(wrapper.findAll('[data-role="building-group-row"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('下沙校区 · 15号楼');
    expect(wrapper.text()).toContain('8 B');
    expect(wrapper.find('[data-role="building-group-preview"]').exists()).toBe(false);
    await wrapper.get('[data-action="select-building-group"]').trigger('click');
    expect(wrapper.get('[data-role="building-group-preview"] img').attributes('src'))
      .toBe('/api/admin/roommate-building-groups/xiasha/15/image');
    wrapper.unmount();
  });

  it('uploads or replaces a valid PNG as pure base64 and refreshes the list', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (init?.method === 'PUT') return jsonResponse(wireItem);
      return jsonResponse({ items: [wireItem] });
    }));
    const wrapper = mount(AdminRoommateBuildingGroups);
    await flushPromises();
    await wrapper.get('select[aria-label="二维码楼栋"]').setValue('15');
    const input = wrapper.get('input[aria-label="选择楼栋群二维码图片"]');
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'qr.png', {
      type: 'image/png',
    });
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] });
    await input.trigger('change');
    await vi.waitFor(() => {
      expect(wrapper.get('[data-action="save-building-group"]').attributes('disabled')).toBeUndefined();
    });
    await wrapper.get('[data-action="save-building-group"]').trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith('该楼栋已有二维码，确定替换吗？');
    const put = requests.find(({ init }) => init?.method === 'PUT');
    expect(put?.url).toBe('/api/admin/roommate-building-groups/xiasha/15');
    expect(JSON.parse(String(put?.init?.body))).toEqual({ mimeType: 'image/png', imageBase64: pngBase64 });
    expect(wrapper.text()).toContain('二维码已保存');
    wrapper.unmount();
  });

  it('rejects unsupported and oversized files without uploading', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetch);
    const wrapper = mount(AdminRoommateBuildingGroups);
    await flushPromises();
    await wrapper.get('select[aria-label="二维码楼栋"]').setValue('1');
    const input = wrapper.get('input[aria-label="选择楼栋群二维码图片"]');

    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['<svg/>'], 'qr.svg', { type: 'image/svg+xml' })],
    });
    await input.trigger('change');
    expect(wrapper.text()).toContain('请选择 PNG 或 JPEG 图片');

    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File([new Uint8Array(1024 * 1024 + 1)], 'large.png', { type: 'image/png' })],
    });
    await input.trigger('change');
    expect(wrapper.text()).toContain('不超过 1 MiB');
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    wrapper.unmount();
  });

  it('confirms deletion, refreshes, and shows the safe local-only 403 message', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    let listCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') return jsonResponse({ status: 'deleted' });
      listCalls += 1;
      return jsonResponse({ items: listCalls === 1 ? [wireItem] : [] });
    }));
    const wrapper = mount(AdminRoommateBuildingGroups);
    await flushPromises();
    await wrapper.get('[data-action="select-building-group"]').trigger('click');
    await wrapper.get('[data-action="delete-building-group"]').trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalled();
    expect(wrapper.text()).toContain('二维码已删除');
    wrapper.unmount();

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'FORBIDDEN' } }, { status: 403 })));
    const forbidden = mount(AdminRoommateBuildingGroups);
    await flushPromises();
    expect(forbidden.text()).toContain('仅允许在本机打开');
    expect(forbidden.text()).not.toMatch(/绕过|关闭防护|X-Forwarded/);
    forbidden.unmount();
  });
});
