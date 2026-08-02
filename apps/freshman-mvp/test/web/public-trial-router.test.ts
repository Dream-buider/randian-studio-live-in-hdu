// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../web/router.js';

describe('public trial router', () => {
  it('keeps the guide public while admin is disabled', () => {
    const router = createAppRouter(createMemoryHistory(), { adminEnabled: false });

    expect(router.getRoutes().map((route) => route.path).sort()).toEqual(['/', '/chat', '/guide']);
    expect(router.resolve('/guide').matched).not.toHaveLength(0);
    expect(router.getRoutes().some((route) => route.path === '/admin')).toBe(false);
  });

  it('keeps admin enabled for the normal local build', () => {
    const router = createAppRouter(createMemoryHistory(), { adminEnabled: true });

    expect(router.getRoutes().map((route) => route.path)).toContain('/admin');
  });
});
