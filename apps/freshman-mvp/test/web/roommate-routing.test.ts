// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import {
  ApiResponseError,
  createRoommateRegistration,
  deleteMyRoommateRegistration,
  getMyRoommateRegistration,
  getRoommateConfig,
  listRoommateMembers,
  recoverRoommateRegistration,
  updateMyRoommateRegistration,
  type RoommateRegistrationInput,
} from '../../web/api.js';
import { createAppRouter } from '../../web/router.js';
import QuestionDeckView from '../../web/views/QuestionDeckView.vue';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

const self = {
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

const member = {
  id: 'registration-1',
  nickname: '小燃',
  contact: { type: 'wechat', value: 'randian-207' },
} as const;

const registrationInput: RoommateRegistrationInput = {
  address: {
    campus: 'xiasha',
    building: '11',
    orientation: 'south',
    room: '207',
  },
  nickname: '小燃',
  contactType: 'wechat',
  contactValue: 'randian-207',
  consent: true,
};

describe('roommate client route and API boundary', () => {
  it('resolves the public roommate route lazily and serves it through the SPA fallback', () => {
    const router = createAppRouter(createMemoryHistory(), { adminEnabled: false });
    const resolved = router.resolve('/roommates');

    expect(resolved.name).toBe('roommates');
    expect(resolved.matched).toHaveLength(1);
    expect(typeof resolved.matched[0]?.components?.default).toBe('function');

    const serverSource = readFileSync(resolve(process.cwd(), 'src/server/app.ts'), 'utf8');
    expect(serverSource).toMatch(/\['\/questions', '\/chat', '\/admin', '\/guide', '\/roommates'\]/);
  });

  it('renders header actions in the exact roommate, guide, catalog order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [{
      id: 'question-1',
      category: '宿舍',
      question: '宿舍在哪里？',
      summary: '以录取通知为准。',
      fullAnswer: '请以学校和学院通知为准。',
      sources: [],
      trustStatus: 'approved',
      updatedAt: '2026-08-11T00:00:00.000Z',
      featured: false,
      displayOrder: 1,
    }] })));
    const router = createAppRouter(createMemoryHistory());
    const wrapper = mount(QuestionDeckView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.findAll('.deck-header-actions > *').map((node) => node.text()))
      .toEqual(['匹配室友', '新生指北', '全部问题']);
    expect(wrapper.get('[data-action="open-roommates"]').attributes('href')).toBe('/roommates');
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('validates configuration and sends same-origin credentials', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
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
    }));

    await expect(getRoommateConfig({ fetcher })).resolves.toMatchObject({
      enabled: true,
      retentionDays: 90,
    });
    expect(fetcher).toHaveBeenCalledWith('/api/roommates/config', {
      credentials: 'same-origin',
    });
  });

  it('implements all registration calls without exposing a raw session token', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        registrationId: 'registration-1',
        managementCode: 'management-code-once',
        own: self,
        members: [member],
      }))
      .mockResolvedValueOnce(jsonResponse({ item: self }))
      .mockResolvedValueOnce(jsonResponse({ item: { ...self, nickname: '小火' } }))
      .mockResolvedValueOnce(jsonResponse({ items: [member] }))
      .mockResolvedValueOnce(jsonResponse({
        registrationId: 'registration-1',
        own: self,
      }))
      .mockResolvedValueOnce(jsonResponse({ status: 'deleted' }));

    const created = await createRoommateRegistration(registrationInput, { fetcher });
    const mine = await getMyRoommateRegistration({ fetcher });
    const updated = await updateMyRoommateRegistration({
      ...registrationInput,
      nickname: '小火',
    }, { fetcher });
    const members = await listRoommateMembers({ fetcher });
    const recovered = await recoverRoommateRegistration({
      registrationId: 'registration-1',
      managementCode: 'management-code-once',
    }, { fetcher });
    await expect(deleteMyRoommateRegistration({ fetcher })).resolves.toBeUndefined();

    expect(created).toEqual({
      registrationId: 'registration-1',
      managementCode: 'management-code-once',
      own: self,
      members: [member],
    });
    expect(mine).toEqual(self);
    expect(updated.nickname).toBe('小火');
    expect(members).toEqual([member]);
    expect(recovered).toEqual({ registrationId: 'registration-1', own: self });
    expect(fetcher.mock.calls).toEqual([
      ['/api/roommates/registrations', expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify(registrationInput),
      })],
      ['/api/roommates/me', { credentials: 'same-origin' }],
      ['/api/roommates/me', expect.objectContaining({
        method: 'PATCH',
        credentials: 'same-origin',
      })],
      ['/api/roommates/members', { credentials: 'same-origin' }],
      ['/api/roommates/recover', expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      })],
      ['/api/roommates/me', expect.objectContaining({
        method: 'DELETE',
        credentials: 'same-origin',
      })],
    ]);
    expect('sessionToken' in created).toBe(false);
    expect('sessionToken' in recovered).toBe(false);
  });

  it('rejects malformed API data and a server response containing a raw session token', async () => {
    await expect(getRoommateConfig({
      fetcher: async () => jsonResponse({ enabled: true, retentionDays: '90', campuses: [] }),
    })).rejects.toBeInstanceOf(ApiResponseError);

    await expect(createRoommateRegistration(registrationInput, {
      fetcher: async () => jsonResponse({
        registrationId: 'registration-1',
        managementCode: 'management-code-once',
        own: {
          ...self,
          sessionToken: 'must-never-reach-the-vue-layer',
        },
        members: [member],
      }),
    })).rejects.toBeInstanceOf(ApiResponseError);

    await expect(listRoommateMembers({
      fetcher: async () => jsonResponse({
        items: [{
          ...member,
          contact: { type: ['wechat'], value: 'array-is-not-an-enum' },
        }],
      }),
    })).rejects.toBeInstanceOf(ApiResponseError);
  });

  it('maps non-2xx responses to a safe status message without exposing server details', async () => {
    const request = getRoommateConfig({
      fetcher: async () => jsonResponse(
        { error: { message: 'database path and encryption key leaked here' } },
        { status: 429 },
      ),
    });

    await expect(request).rejects.toMatchObject({
      name: 'Error',
      status: 429,
      message: '请求过于频繁，请稍后再试',
    });
    await expect(request).rejects.not.toThrow(/database|encryption key/i);
  });
});
