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
await page.goto('https://www.feishu.cn/wiki/', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
const data = await page.evaluate(() => {
  const out = [];
  const seen = new WeakSet();
  function scan(obj, path = '$', depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 4 || seen.has(obj)) return;
    seen.add(obj);
    for (const [k, v] of Object.entries(obj).slice(0, 200)) {
      const p = `${path}.${k}`;
      if (typeof v === 'string' && (v.includes('LIVE IN HDU') || v.includes('杭州电子科技大学'))) {
        out.push({ path: p, value: v.slice(0, 500), parent: JSON.stringify(obj).slice(0, 1500) });
      } else if (v && typeof v === 'object') {
        scan(v, p, depth + 1);
      }
    }
  }
  scan(window);
  const htmlMatches = [...document.documentElement.innerHTML.matchAll(/.{0,120}LIVE IN HDU.{0,500}/g)].map((m) => m[0]);
  return { out: out.slice(0, 50), htmlMatches: htmlMatches.slice(0, 20) };
});
console.log(JSON.stringify(data, null, 2));
await context.close();
