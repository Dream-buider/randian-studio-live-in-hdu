// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoommateView from '../../web/views/RoommateView.vue';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const enabledConfig = {
  enabled: true,
  retentionDays: 90,
  campuses: [{
    code: 'xiasha',
    name: '下沙校区',
    templateVersion: 'xiasha-v1',
    enabled: true,
  }, {
    code: 'shaoxing',
    name: '绍兴校区',
    templateVersion: null,
    enabled: false,
    unavailableReason: '寝室分配规则确认中，暂未开放匹配',
  }],
} as const;

const own = {
  id: 'registration-1',
  address: {
    campus: 'xiasha',
    templateVersion: 'xiasha-v1',
    building: '11',
    orientation: 'south',
    room: '207',
    canonical: 'xiasha|xiasha-v1|11|south|207',
    display: '下沙校区 · 11号楼 · 南 · 207',
  },
  nickname: '小燃',
  contact: { type: 'wechat', value: 'randian-207' },
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  expiresAt: '2026-11-09T00:00:00.000Z',
  deletedAt: null,
} as const;

const hiddenOwn = {
  ...own,
  status: 'hidden' as const,
};

const noContactMember = {
  id: 'registration-2',
  nickname: '小火',
  contact: null,
} as const;

function unauthenticatedSetup(extra?: (url: string, init?: RequestInit) => Response | null) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url === '/api/roommates/config') return jsonResponse(enabledConfig);
    if (url === '/api/roommates/me') {
      return jsonResponse({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function openRegistrationForm(fetcher = unauthenticatedSetup()) {
  vi.stubGlobal('fetch', fetcher);
  const wrapper = mount(RoommateView);
  await flushPromises();
  return { wrapper, fetcher };
}

async function fillXiaShaForm(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('input[name="building"]').setValue('011');
  await wrapper.get('select[name="orientation"]').setValue('south');
  await wrapper.get('input[name="room"]').setValue('0207');
  await wrapper.get('input[name="nickname"]').setValue('小燃');
}

describe('roommate matching client flow', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.innerHTML = '';
  });

  it('explains the disabled state without exposing server configuration details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      ...enabledConfig,
      enabled: false,
    })));
    const wrapper = mount(RoommateView);
    await flushPromises();

    expect(wrapper.get('[data-state="disabled"]').text()).toContain('匹配室友暂未开放');
    expect(wrapper.text()).toContain('安全连接和上线准备');
    expect(wrapper.text()).toContain('完成后即可使用');
    expect(wrapper.text()).not.toMatch(/ROOMMATE_|encryption|HMAC|secret/i);
  });

  it('treats a real no-cookie 404 response as a first-time registration', async () => {
    const { wrapper } = await openRegistrationForm();

    expect(wrapper.get('[data-state="register"]').text()).toContain('登记寝室');
    expect(wrapper.text()).not.toContain('这次操作没有完成');
  });

  it('keeps Shaoxing visible and blocks submission while rendering the complete XiaSha form', async () => {
    const { wrapper } = await openRegistrationForm();

    expect(wrapper.get('label[for="roommate-building"]').text()).toContain('楼栋');
    expect(wrapper.get('label[for="roommate-orientation"]').text()).toContain('南北');
    expect(wrapper.get('label[for="roommate-room"]').text()).toContain('寝室号');
    expect(wrapper.get('label[for="roommate-nickname"]').text()).toContain('昵称');
    expect(wrapper.get('label[for="roommate-contact-type"]').text()).toContain('联系方式类型');
    expect(wrapper.find('input[name="consent"]').exists()).toBe(false);

    await wrapper.get('select[name="campus"]').setValue('shaoxing');
    expect(wrapper.text()).toContain('寝室分配规则确认中，暂未开放匹配');
    expect(wrapper.get('[data-action="confirm-registration"]').attributes('disabled')).toBeDefined();

    await wrapper.get('select[name="campus"]').setValue('xiasha');
    await wrapper.get('select[name="contactType"]').setValue('wechat');
    await wrapper.get('input[name="contactValue"]').setValue('randian-207');
    expect(wrapper.get('input[name="consent"]').attributes('required')).toBeDefined();
    expect(wrapper.text()).toContain('非学校官方身份认证系统');
    expect(wrapper.text()).toContain('90 天');
    expect(wrapper.text()).toContain('身份证号');
  });

  it('enforces backend field limits and associates visible validation errors with inputs', async () => {
    const { wrapper } = await openRegistrationForm();
    const form = wrapper.get('form[data-role="roommate-registration-form"]');

    await wrapper.get('input[name="building"]').setValue('0');
    await wrapper.get('input[name="room"]').setValue('20#7');
    await wrapper.get('input[name="nickname"]').setValue('x'.repeat(31));
    await wrapper.get('select[name="contactType"]').setValue('wechat');
    expect(wrapper.get('[data-action="confirm-registration"]').attributes('disabled'))
      .toBeUndefined();
    await form.trigger('submit');

    const building = wrapper.get('input[name="building"]');
    const room = wrapper.get('input[name="room"]');
    const nickname = wrapper.get('input[name="nickname"]');
    const contact = wrapper.get('input[name="contactValue"]');
    expect(building.attributes('aria-invalid')).toBe('true');
    expect(building.attributes('aria-describedby')).toContain('roommate-building-message');
    expect(wrapper.get('#roommate-building-message').text()).toContain('正整数');
    expect(room.attributes('aria-invalid')).toBe('true');
    expect(room.attributes('aria-describedby')).toContain('roommate-room-message');
    expect(nickname.attributes('maxlength')).toBe('30');
    expect(nickname.attributes('aria-invalid')).toBe('true');
    expect(contact.attributes('maxlength')).toBe('100');
    expect(contact.attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#roommate-contact-message').text()).toContain('选择类型后请填写');
    expect(wrapper.find('[data-state="confirm"]').exists()).toBe(false);
  });

  it('confirms the normalized room, creates once, and removes the one-time code after leaving', async () => {
    const managementCode = 'one-time-management-code';
    const fetcher = unauthenticatedSetup((url, init) => {
      if (url === '/api/roommates/registrations' && init?.method === 'POST') {
        return jsonResponse({
          registrationId: own.id,
          managementCode,
          own,
          members: [own, noContactMember].map(({ id, nickname, contact }) => ({ id, nickname, contact })),
        });
      }
      return null;
    });
    const { wrapper } = await openRegistrationForm(fetcher);
    await fillXiaShaForm(wrapper);
    await wrapper.get('form[data-role="roommate-registration-form"]').trigger('submit');

    expect(wrapper.get('[data-state="confirm"]').text())
      .toContain('下沙校区 · 11号楼 · 南 · 207');
    await wrapper.get('[data-action="create-registration"]').trigger('click');
    await flushPromises();

    const credential = wrapper.get('[data-state="credential"]');
    expect(credential.text()).toContain('registration-1');
    expect(credential.text()).toContain(managementCode);
    expect(credential.text()).toContain('暂未留下联系方式');
    await wrapper.get('[data-action="copy-credential"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('无法自动复制，请手动复制并保存');
    expect(wrapper.get('[data-action="copy-credential"]').text()).not.toContain('已复制');
    await wrapper.get('[data-action="credential-saved"]').trigger('click');
    expect(wrapper.get('[data-state="members"]').text()).toContain('小火');
    expect(wrapper.text()).not.toContain(managementCode);
  });

  it('updates the existing record and confirms deletion before removing it', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    let currentNickname: string = own.nickname;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/roommates/config') return jsonResponse(enabledConfig);
      if (url === '/api/roommates/me' && !init?.method) return jsonResponse({ item: own });
      if (url === '/api/roommates/members') {
        return jsonResponse({ items: [{ id: own.id, nickname: currentNickname, contact: own.contact }] });
      }
      if (url === '/api/roommates/me' && init?.method === 'PATCH') {
        currentNickname = '小火';
        return jsonResponse({ item: { ...own, nickname: '小火' } });
      }
      if (url === '/api/roommates/me' && init?.method === 'DELETE') {
        return jsonResponse({ status: 'deleted' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const wrapper = mount(RoommateView);
    await flushPromises();

    await wrapper.get('[data-action="edit-registration"]').trigger('click');
    expect((wrapper.get('input[name="nickname"]').element as HTMLInputElement).value).toBe('小燃');
    await wrapper.get('input[name="nickname"]').setValue('小火');
    await wrapper.get('form[data-role="roommate-registration-form"]').trigger('submit');
    await wrapper.get('[data-action="update-registration"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-state="members"]').text()).toContain('小火');

    await wrapper.get('[data-action="delete-registration"]').trigger('click');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    confirm.mockReturnValue(true);
    await wrapper.get('[data-action="delete-registration"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-state="register"]').text()).toContain('登记寝室');
  });

  it('keeps a hidden registration editable and deletable without requesting or rendering members', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/roommates/config') return jsonResponse(enabledConfig);
      if (url === '/api/roommates/me' && !init?.method) return jsonResponse({ item: hiddenOwn });
      if (url === '/api/roommates/me' && init?.method === 'PATCH') {
        return jsonResponse({ item: { ...hiddenOwn, nickname: '隐藏后修改' } });
      }
      if (url === '/api/roommates/me' && init?.method === 'DELETE') {
        return jsonResponse({ status: 'deleted' });
      }
      if (url === '/api/roommates/members') {
        throw new Error('hidden registration must not request members');
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const wrapper = mount(RoommateView);
    await flushPromises();

    expect(wrapper.get('[data-state="members"]').text()).toContain(
      '登记已被隐藏，暂时不能查看成员；可修改资料并等待管理员恢复',
    );
    expect(wrapper.find('.roommate-member-grid').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('0 人已登记');

    await wrapper.get('[data-action="edit-registration"]').trigger('click');
    await wrapper.get('input[name="nickname"]').setValue('隐藏后修改');
    await wrapper.get('form[data-role="roommate-registration-form"]').trigger('submit');
    await wrapper.get('[data-action="update-registration"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-state="members"]').text()).toContain('登记已被隐藏');

    await wrapper.get('[data-action="delete-registration"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-state="register"]').text()).toContain('登记寝室');
    expect(fetcher.mock.calls.some(([url]) => String(url) === '/api/roommates/members')).toBe(false);
  });

  it('recovers a hidden registration without requesting members or treating it as new', async () => {
    const fetcher = unauthenticatedSetup((url, init) => {
      if (url === '/api/roommates/recover' && init?.method === 'POST') {
        return jsonResponse({ registrationId: hiddenOwn.id, own: hiddenOwn });
      }
      if (url === '/api/roommates/members') {
        throw new Error('hidden registration must not request members');
      }
      return null;
    });
    const { wrapper } = await openRegistrationForm(fetcher);
    await wrapper.get('[data-action="open-recovery"]').trigger('click');
    const recover = wrapper.get('form[data-role="roommate-recovery-form"]');
    await recover.get('input[name="registrationId"]').setValue(hiddenOwn.id);
    await recover.get('input[name="managementCode"]').setValue('hidden-management-code');
    await recover.trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-state="members"]').text()).toContain(
      '登记已被隐藏，暂时不能查看成员；可修改资料并等待管理员恢复',
    );
    expect(wrapper.find('.roommate-member-grid').exists()).toBe(false);
  });

  it('requires the complete recovery credential and never writes it to browser storage', async () => {
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');
    const fetcher = unauthenticatedSetup((url, init) => {
      if (url === '/api/roommates/recover' && init?.method === 'POST') {
        return jsonResponse({ registrationId: own.id, own });
      }
      if (url === '/api/roommates/members') {
        return jsonResponse({ items: [{ id: own.id, nickname: own.nickname, contact: own.contact }] });
      }
      return null;
    });
    const { wrapper } = await openRegistrationForm(fetcher);
    await wrapper.get('[data-action="open-recovery"]').trigger('click');
    const recover = wrapper.get('form[data-role="roommate-recovery-form"]');
    expect(recover.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    await recover.get('input[name="registrationId"]').setValue(own.id);
    expect(recover.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    await recover.get('input[name="managementCode"]').setValue('recovery-secret-code');
    await recover.trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-state="members"]').text()).toContain(own.nickname);
    expect(localWrite).not.toHaveBeenCalledWith(expect.any(String), expect.stringContaining('recovery-secret-code'));
    expect(JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
      .not.toContain('recovery-secret-code');
  });

  it('preserves entered values after an API failure and supports an explicit retry', async () => {
    let attempts = 0;
    const fetcher = unauthenticatedSetup((url, init) => {
      if (url === '/api/roommates/registrations' && init?.method === 'POST') {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ error: { code: 'UNAVAILABLE' } }, { status: 503 })
          : jsonResponse({
            registrationId: own.id,
            managementCode: 'retry-code',
            own,
            members: [{ id: own.id, nickname: own.nickname, contact: own.contact }],
          });
      }
      return null;
    });
    const { wrapper } = await openRegistrationForm(fetcher);
    await fillXiaShaForm(wrapper);
    await wrapper.get('form[data-role="roommate-registration-form"]').trigger('submit');
    await wrapper.get('[data-action="create-registration"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-state="error"]').text()).toContain('室友匹配暂不可用');
    await wrapper.get('[data-action="retry-roommate-action"]').trigger('click');
    expect(wrapper.get('[data-state="confirm"]').text())
      .toContain('下沙校区 · 11号楼 · 南 · 207');
    await wrapper.get('[data-action="create-registration"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-state="credential"]').text()).toContain('retry-code');
  });

  it('never exposes arbitrary network diagnostics in the error state', async () => {
    const diagnostic = 'socket failed at C:\\secret\\roommate-key.txt';
    const fetcher = unauthenticatedSetup((url, init) => {
      if (url === '/api/roommates/registrations' && init?.method === 'POST') {
        throw new Error(diagnostic);
      }
      return null;
    });
    const { wrapper } = await openRegistrationForm(fetcher);
    await fillXiaShaForm(wrapper);
    await wrapper.get('form[data-role="roommate-registration-form"]').trigger('submit');
    await wrapper.get('[data-action="create-registration"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-state="error"]').text()).toContain('请求失败，请稍后重试');
    expect(wrapper.text()).not.toContain(diagnostic);
    expect(wrapper.text()).not.toContain('roommate-key.txt');
  });

  it('sets noindex,nofollow only while the roommate route is mounted', async () => {
    const existing = document.createElement('meta');
    existing.name = 'robots';
    existing.content = 'index,follow';
    document.head.append(existing);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...enabledConfig, enabled: false })));

    const wrapper = mount(RoommateView);
    await flushPromises();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content'))
      .toBe('noindex,nofollow');
    wrapper.unmount();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content'))
      .toBe('index,follow');
  });
});
