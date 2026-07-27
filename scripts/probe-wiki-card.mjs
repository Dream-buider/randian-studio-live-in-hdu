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
const data = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const points = [[395,334],[390,276],[350,260],[430,420],[460,238]];
  return points.map(([x,y]) => {
    let el = document.elementFromPoint(x,y);
    const chain = [];
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      chain.push({
        tag: el.tagName,
        text: clean(el.innerText).slice(0,200),
        href: el.href || '',
        role: el.getAttribute('role') || '',
        aria: el.getAttribute('aria-label') || '',
        cls: el.className?.toString?.().slice(0,150) || '',
      });
    }
    return { x, y, chain };
  });
});
console.log(JSON.stringify(data, null, 2));
await context.close();
