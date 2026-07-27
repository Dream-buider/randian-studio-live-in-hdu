import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const origin = 'https://scnbcye3xdfz.feishu.cn';
const target = `${origin}/wiki/EdTqwwPDwiuNuwkJjUecYCB5ncf`;

function webbridge(action, args = {}, session = 'hdu-publish') {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ action, args, session });
    const req = http.request({ hostname: '127.0.0.1', port: 10086, path: '/command', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        try {
          const payload = JSON.parse(text);
          if (!payload.ok) reject(new Error(payload.error?.message || text));
          else resolve(payload.data);
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const result = await webbridge('evaluate', {
  code: `(() => JSON.stringify({
    cookie: document.cookie,
    storage: {
      xmst: localStorage.getItem('xmst'),
      baseUserId: localStorage.getItem('__base_user_id__'),
      userUniqueId: localStorage.getItem('userUniqueId'),
      wikiSidebarMode: localStorage.getItem('WIKI_SIDEBAR_MODE')
    }
  }))()`,
});
const auth = JSON.parse(result.value);
if (!auth.storage.xmst) throw new Error('Real browser did not expose the expected Feishu session storage token.');

const cookies = auth.cookie.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
  const split = part.indexOf('=');
  return { name: part.slice(0, split), value: part.slice(split + 1), url: origin };
});

const context = await chromium.launchPersistentContext(path.join(root, '.pw-edge-profile'), {
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: false,
  viewport: { width: 1456, height: 900 },
});
await context.addCookies(cookies);
await context.addInitScript((storage) => {
  if (location.hostname.endsWith('feishu.cn')) {
    if (storage.xmst) localStorage.setItem('xmst', storage.xmst);
    if (storage.baseUserId) localStorage.setItem('__base_user_id__', storage.baseUserId);
    if (storage.userUniqueId) localStorage.setItem('userUniqueId', storage.userUniqueId);
    if (storage.wikiSidebarMode) localStorage.setItem('WIKI_SIDEBAR_MODE', storage.wikiSidebarMode);
  }
}, auth.storage);
const page = context.pages()[0] ?? await context.newPage();
await page.goto(target, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const verification = {
  url: page.url(),
  title: await page.title(),
  hasCourseReview: (await page.locator('body').innerText()).includes('课程复习'),
  hasLoginPrompt: page.url().includes('/accounts/page/login'),
};
console.log(JSON.stringify(verification, null, 2));
await context.close();
if (verification.hasLoginPrompt || !verification.hasCourseReview) process.exitCode = 1;
