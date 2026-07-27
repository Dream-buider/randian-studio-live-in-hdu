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
const hits = [];
page.on('response', async (res) => {
  const url = res.url();
  if (!/wiki|space|explorer|drive|api|suite|docx/i.test(url)) return;
  try {
    const text = await res.text();
    if (text.includes('LIVE IN HDU') || text.includes('杭州电子科技大学')) {
      hits.push({ url, status: res.status(), text: text.slice(0, 3000) });
    }
  } catch {}
});
await page.goto('https://www.feishu.cn/wiki/', { waitUntil: 'networkidle' });
await page.waitForTimeout(10000);
console.log(JSON.stringify(hits.slice(0, 20), null, 2));
await context.close();
