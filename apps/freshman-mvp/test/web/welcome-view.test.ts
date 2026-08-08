// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import WelcomeView from '../../web/views/WelcomeView.vue';

const TARGET = Date.parse('2026-09-16T00:00:00+08:00');

async function mountWelcome(now: number) {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: WelcomeView },
      {
        path: '/questions',
        name: 'deck',
        component: defineComponent({ template: '<main>Question deck</main>' }),
      },
    ],
  });
  await router.push('/');
  await router.isReady();
  return mount(WelcomeView, {
    global: {
      plugins: [router],
      stubs: {
        ArrivalLightfall: defineComponent({
          template: '<div data-role="arrival-lightfall" aria-hidden="true" />',
        }),
      },
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('WelcomeView', () => {
  it('renders the exact remaining time as four labeled values', async () => {
    const now = TARGET - (((24 + 2) * 60 * 60 + 3 * 60 + 4) * 1000);
    const wrapper = await mountWelcome(now);

    expect(wrapper.get('main').attributes('data-theme')).toBe('randian-dawn');
    expect(wrapper.get('[role="timer"]').attributes('aria-label')).toBe(
      '距离开学还有1天2小时3分4秒',
    );
    expect(wrapper.get('[data-unit="days"] [data-role="value"]').text()).toBe('1');
    expect(wrapper.get('[data-unit="hours"] [data-role="value"]').text()).toBe('02');
    expect(wrapper.get('[data-unit="minutes"] [data-role="value"]').text()).toBe('03');
    expect(wrapper.get('[data-unit="seconds"] [data-role="value"]').text()).toBe('04');
    expect(wrapper.text()).toContain('北京时间 2026.09.16 00:00');
    expect(wrapper.get('.welcome-scene').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('.welcome-scene').attributes('data-scene-grade')).toBe('bright-dawn');
    expect(wrapper.get('[data-role="arrival-lightfall"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('[data-role="cinema-aperture"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.findAll('[data-role="film-focus-ring"]')).toHaveLength(3);
    expect(wrapper.get('[data-role="exposure-horizon"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('.countdown-grid').findAll('.countdown-card')).toHaveLength(4);

    wrapper.unmount();
  });

  it('links directly into the named question deck route', async () => {
    const wrapper = await mountWelcome(TARGET - 10_000);

    const entry = wrapper.get('[data-action="enter-deck"]');
    expect(entry.text()).toBe('进入新生问答');
    expect(entry.attributes('href')).toBe('/questions');

    wrapper.unmount();
  });

  it('keeps the arrival message focused without a duplicate date eyebrow', async () => {
    const wrapper = await mountWelcome(TARGET - 10_000);

    expect(wrapper.text()).not.toContain('AUTUMN ARRIVAL');

    wrapper.unmount();
  });

  it('updates the visible seconds once per second', async () => {
    const wrapper = await mountWelcome(TARGET - 2_000);

    expect(wrapper.get('[data-unit="seconds"] [data-role="value"]').text()).toBe('02');
    await vi.advanceTimersByTimeAsync(1_000);
    await nextTick();
    expect(wrapper.get('[data-unit="seconds"] [data-role="value"]').text()).toBe('01');

    wrapper.unmount();
  });

  it('announces the completed state without rendering negative time', async () => {
    const wrapper = await mountWelcome(TARGET + 1_000);

    expect(wrapper.get('[role="status"]').text()).toContain('开学啦');
    expect(wrapper.get('[role="timer"]').text()).not.toContain('-');
    expect(wrapper.get('[data-unit="seconds"] [data-role="value"]').text()).toBe('00');

    wrapper.unmount();
  });

  it('releases its ticking timer when the view unmounts', async () => {
    const wrapper = await mountWelcome(TARGET - 10_000);

    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
