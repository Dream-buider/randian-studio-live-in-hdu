// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../web/router.js';

describe('public trial router', () => {
  it('contains only deck and chat when admin is disabled', () => {
    const router = createAppRouter(createMemoryHistory(), { adminEnabled: false });

    expect(router.getRoutes().map((route) => route.path).sort()).toEqual(['/', '/chat']);
  });

  it('keeps admin enabled for the normal local build', () => {
    const router = createAppRouter(createMemoryHistory(), { adminEnabled: true });

    expect(router.getRoutes().map((route) => route.path)).toContain('/admin');
  });
});
