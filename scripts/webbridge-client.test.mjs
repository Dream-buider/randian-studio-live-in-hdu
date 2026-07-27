import assert from 'node:assert/strict';
import test from 'node:test';
import { WebBridgeClient } from './webbridge-client.mjs';

test('connected WebBridge exposes the authenticated Feishu page', async () => {
  const client = new WebBridgeClient({ session: 'hdu-publish' });
  const result = await client.evaluate(`(() => ({
    url: location.href,
    hasVisibleEditButton: [...document.querySelectorAll('button')].some((element) => (element.innerText || '').trim() === '编辑' && (element.offsetWidth || element.offsetHeight)),
    hasLoginButton: [...document.querySelectorAll('button')].some((element) => (element.innerText || '').includes('登录/注册') && (element.offsetWidth || element.offsetHeight))
  }))()`);
  assert.match(result.url, /scnbcye3xdfz\.feishu\.cn\/wiki\//);
  assert.equal(result.hasVisibleEditButton, true);
  assert.equal(result.hasLoginButton, false);
});

test('connected WebBridge exposes trusted CDP commands', async () => {
  const client = new WebBridgeClient({ session: 'hdu-publish' });
  const result = await client.command('cdp', { method: 'Runtime.evaluate', params: { expression: '1 + 1', returnByValue: true } });
  assert.equal(result.result.value, 2);
});

test('evaluateAsync waits for browser promises', async () => {
  const client = new WebBridgeClient({ session: 'hdu-publish' });
  const value = await client.evaluateAsync(`(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return 7; })()`);
  assert.equal(value, 7);
});
