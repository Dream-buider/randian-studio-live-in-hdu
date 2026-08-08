// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent } from 'vue';
import GuideView from '../../web/views/GuideView.vue';
import { FRESHMAN_GUIDE_SECTIONS } from '../../src/content/freshman-guide.js';

const TOKENS_CSS = readFileSync(resolve(process.cwd(), 'web/styles/tokens.css'), 'utf8')
  .replace(/\r\n/g, '\n');

async function mountGuide() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/guide', component: GuideView },
      {
        path: '/questions',
        name: 'deck',
        component: defineComponent({ template: '<main>Question deck</main>' }),
      },
    ],
  });
  await router.push('/guide');
  await router.isReady();
  return mount(GuideView, { global: { plugins: [router] } });
}

describe('GuideView signal stations', () => {
  it('keeps every guide section and source link in one ordered signal route', async () => {
    const wrapper = await mountGuide();

    expect(wrapper.get('main').attributes('data-theme')).toBe('randian-dawn');
    const route = wrapper.get('[data-role="signal-route"]');
    expect(route.attributes('aria-label')).toBe('新生指北信号站');
    expect(route.attributes('data-energy')).toBe('dawn');
    const directChildren = Array.from(route.element.children);
    expect(directChildren).toHaveLength(4);
    expect(directChildren.every((child) => child.tagName === 'LI')).toBe(true);

    const pulse = wrapper.get('.signal-energy-pulse');
    expect(pulse.attributes('aria-hidden')).toBe('true');
    expect(route.find('.signal-energy-pulse').exists()).toBe(false);

    const stations = route.findAll('[data-role="signal-station"]');
    expect(stations).toHaveLength(FRESHMAN_GUIDE_SECTIONS.length);

    FRESHMAN_GUIDE_SECTIONS.forEach((section, index) => {
      const station = stations[index];
      expect(station.get('[data-role="station-index"]').text()).toBe(
        String(index + 1).padStart(2, '0'),
      );
      expect(station.text()).toContain(section.title);
      expect(station.text()).toContain(section.summary);
      section.topics.forEach((topic) => expect(station.text()).toContain(topic));

      const source = station.get('a');
      expect(source.attributes('href')).toBe(section.href);
      expect(source.attributes('target')).toBe('_blank');
      expect(source.attributes('rel')).toBe('noopener noreferrer');
    });

    expect(wrapper.get('.guide-return').attributes('href')).toBe('/questions');
    wrapper.unmount();
  });

  it('uses accessible dawn semantics and phases all four station list items', () => {
    expect(TOKENS_CSS).toContain(
      '.guide-page[data-theme="randian-dawn"] .signal-kicker {\n  color: var(--student-trust);',
    );
    expect(TOKENS_CSS).toContain(
      '.guide-page[data-theme="randian-dawn"] .guide-return {',
    );
    expect(TOKENS_CSS).toContain(
      '.guide-page[data-theme="randian-dawn"] .signal-status {\n  color: var(--student-trust);',
    );
    expect(TOKENS_CSS).toContain('.guide-signal-station:nth-of-type(4) .signal-node::after');
    expect(TOKENS_CSS).not.toContain('.guide-signal-station:nth-child(');
  });
});
