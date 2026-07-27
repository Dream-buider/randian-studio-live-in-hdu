import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCdpCookies } from './feishu-auth-bridge.mjs';

test('normalizeCdpCookies keeps Feishu HttpOnly session cookies and Playwright fields', () => {
  const result = normalizeCdpCookies([
    { name: 'session', value: 'secret', domain: '.feishu.cn', path: '/', httpOnly: true, secure: true, sameSite: 'None', expires: 1800000000 },
    { name: 'host', value: 'v', domain: 'scnbcye3xdfz.feishu.cn', path: '/', httpOnly: false, secure: true, session: true, expires: -1 },
    { name: 'other', value: 'x', domain: '.example.com', path: '/' },
  ]);

  assert.deepEqual(result, [
    { name: 'session', value: 'secret', domain: '.feishu.cn', path: '/', httpOnly: true, secure: true, sameSite: 'None', expires: 1800000000 },
    { name: 'host', value: 'v', domain: 'scnbcye3xdfz.feishu.cn', path: '/', httpOnly: false, secure: true },
  ]);
});
