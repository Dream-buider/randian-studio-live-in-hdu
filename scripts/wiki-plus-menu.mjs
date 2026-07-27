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
await page.goto('https://scnbcye3xdfz.feishu.cn/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.mouse.click(1362, 32);
await page.waitForTimeout(2500);
const data = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return {
    url: location.href,
    bodyText: clean(document.body.innerText).slice(0, 5000),
    items: [...document.querySelectorAll('button, [role="button"], [role="menuitem"], li, a, div')]
      .map((el) => ({
        tag: el.tagName,
        text: clean(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title')),
        role: el.getAttribute('role') || '',
        cls: el.className?.toString?.().slice(0, 120) || '',
      }))
      .filter((x) => x.text)
      .slice(-120),
  };
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\wiki-plus-menu.png', fullPage: true });
await context.close();
