import path from 'node:path';
import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(process.cwd(), '.pw-edge-profile');

const pages = [
  {
    name: 'reference-waytoagi',
    url: 'https://waytoagi.feishu.cn/wiki/QPe5w5g7UisbEkkow8XcDmOpn8e',
    screenshot: 'reference-waytoagi-layout.png',
  },
  {
    name: 'live-in-hdu',
    url: 'https://scnbcye3xdfz.feishu.cn/wiki/XI0hwjd9biAw6Kkz3afcmEGxn6g',
    screenshot: 'live-in-hdu-before-layout.png',
  },
];

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 819 },
  args: ['--start-maximized'],
});

const page = context.pages()[0] ?? await context.newPage();
const summaries = [];

for (const item of pages) {
  await page.goto(item.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(process.cwd(), item.screenshot), fullPage: true });

  const summary = await page.evaluate(() => {
    const cleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();
    const blocks = [...document.querySelectorAll('h1,h2,h3,h4,blockquote,table,[data-block-id],.zone-container,.docx-page-title,.wiki-page-title')]
      .map((el) => ({
        tag: el.tagName,
        text: cleanText(el.innerText).slice(0, 220),
        cls: el.className?.toString?.().slice(0, 160) || '',
        role: el.getAttribute('role') || '',
        aria: el.getAttribute('aria-label') || '',
      }))
      .filter((x) => x.text || x.aria)
      .slice(0, 120);

    const interactive = [...document.querySelectorAll('button,[role="button"],a,[aria-label]')]
      .map((el) => ({
        tag: el.tagName,
        text: cleanText(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title')).slice(0, 120),
        href: el.href || '',
        cls: el.className?.toString?.().slice(0, 120) || '',
        aria: el.getAttribute('aria-label') || '',
      }))
      .filter((x) => x.text || x.href || x.aria)
      .slice(0, 160);

    return {
      title: document.title,
      url: location.href,
      bodyText: cleanText(document.body.innerText).slice(0, 8000),
      headings: [...document.querySelectorAll('h1,h2,h3')]
        .map((el) => ({ tag: el.tagName, text: cleanText(el.innerText) }))
        .filter((x) => x.text),
      blocks,
      interactive,
    };
  });

  summaries.push({ name: item.name, ...summary });
}

console.log(JSON.stringify(summaries, null, 2));
await context.close();
