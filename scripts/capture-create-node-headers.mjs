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
const hits = [];
page.on('request', (req) => {
  if (req.url().includes('/space/api/wiki/v2/tree/create_node/')) {
    hits.push({ method: req.method(), url: req.url(), headers: req.headers(), postData: req.postData() });
  }
});
await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.mouse.click(1362, 32);
await page.waitForTimeout(1500);
await page.getByRole('menuitem', { name: '文档' }).click();
await page.waitForTimeout(8000);
await page.getByText('新建空白文档', { exact: true }).click();
await page.waitForTimeout(8000);
console.log(JSON.stringify(hits, null, 2));
await context.close();
