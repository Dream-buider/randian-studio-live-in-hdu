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
await page.goto(process.argv[2] ?? 'https://www.feishu.cn/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);

const data = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const buttons = [...document.querySelectorAll('button, [role="button"], a')]
    .map((el) => ({
      tag: el.tagName,
      text: clean(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title')),
      href: el.href || '',
      cls: el.className?.toString?.() || '',
    }))
    .filter((x) => x.text || x.href)
    .slice(0, 120);
  return {
    title: document.title,
    url: location.href,
    bodyText: clean(document.body.innerText).slice(0, 5000),
    buttons,
  };
});

console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\feishu-inspect.png', fullPage: true });
await context.close();
