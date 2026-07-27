import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\.pw-edge-profile';
const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 819 },
  args: ['--start-maximized'],
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto('https://www.feishu.cn/wiki/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const card = page.locator('.wiki-space-grid-item').filter({ hasText: 'LIVE IN HDU' }).first();
await card.hover();
await page.waitForTimeout(500);
await card.dblclick({ force: true });
await page.waitForTimeout(10000);
if (page.url().includes('/wiki/') && await page.getByText('知识库设置').count()) {
  await card.click({ button: 'left', clickCount: 1, force: true });
  await page.waitForTimeout(5000);
}
const data = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return { title: document.title, url: location.href, bodyText: clean(document.body.innerText).slice(0, 6000) };
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\live-in-hdu-enter-js.png', fullPage: true });
await context.close();
