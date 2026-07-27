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
await page.goto('https://www.feishu.cn/wiki', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

await page.getByText('新建知识库', { exact: true }).last().click();
await page.waitForTimeout(3000);

const data = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return {
    title: document.title,
    url: location.href,
    bodyText: clean(document.body.innerText).slice(0, 3000),
    inputs: [...document.querySelectorAll('input, textarea')]
      .map((el) => ({ placeholder: el.getAttribute('placeholder'), value: el.value, type: el.type, aria: el.getAttribute('aria-label') })),
    buttons: [...document.querySelectorAll('button, [role="button"]')]
      .map((el) => clean(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title')))
      .filter(Boolean)
      .slice(0, 80),
  };
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\create-wiki-step1.png', fullPage: true });
await context.close();
