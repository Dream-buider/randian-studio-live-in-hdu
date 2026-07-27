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
await page.mouse.click(395, 334);
await page.waitForTimeout(10000);

const data = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return {
    title: document.title,
    url: location.href,
    bodyText: clean(document.body.innerText).slice(0, 6000),
    buttons: [...document.querySelectorAll('button, [role="button"], a, [aria-label]')]
      .map((el) => ({
        tag: el.tagName,
        text: clean(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title')),
        href: el.href || '',
        aria: el.getAttribute('aria-label') || '',
      }))
      .filter((x) => x.text || x.href || x.aria)
      .slice(0, 180),
  };
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\live-in-hdu-inside.png', fullPage: true });
await context.close();
