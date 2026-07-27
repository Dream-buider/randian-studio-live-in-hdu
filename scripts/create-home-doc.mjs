import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\.pw-edge-profile';
const rootUrl = 'https://scnbcye3xdfz.feishu.cn/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc';

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 819 },
  args: ['--start-maximized'],
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.mouse.click(1362, 32);
await page.waitForTimeout(1500);
await page.getByRole('menuitem', { name: '文档' }).click();
await page.waitForTimeout(12000);

const data = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return {
    title: document.title,
    url: location.href,
    bodyText: clean(document.body.innerText).slice(0, 5000),
    inputs: [...document.querySelectorAll('input, textarea, [contenteditable="true"]')]
      .map((el) => ({
        tag: el.tagName,
        text: clean(el.innerText || el.value || ''),
        placeholder: el.getAttribute('placeholder'),
        aria: el.getAttribute('aria-label'),
        cls: el.className?.toString?.().slice(0, 120) || '',
      }))
      .slice(0, 80),
  };
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\home-doc-created-blank.png', fullPage: true });
await context.close();
