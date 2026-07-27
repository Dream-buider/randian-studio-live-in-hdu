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
const reqs = [];
page.on('request', (req) => {
  const url = req.url();
  if (/create|docx|wiki|space|template|drive|suite|node|explorer/i.test(url)) {
    reqs.push({ method: req.method(), url, postData: req.postData()?.slice(0, 1500) || '' });
  }
});
page.on('response', async (res) => {
  const url = res.url();
  if (/create|docx|wiki|space|template|drive|suite|node|explorer/i.test(url)) {
    try {
      const text = await res.text();
      if (/token|url|doc|wiki|obj|space|success/i.test(text)) {
        reqs.push({ response: res.status(), url, text: text.slice(0, 2000) });
      }
    } catch {}
  }
});

await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.mouse.click(1362, 32);
await page.waitForTimeout(1500);
await page.getByRole('menuitem', { name: '文档' }).click();
await page.waitForTimeout(8000);
await page.getByText('新建空白文档', { exact: true }).click();
await page.waitForTimeout(15000);

console.log(JSON.stringify({ url: page.url(), title: await page.title(), reqs: reqs.slice(-80) }, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\capture-create-doc.png', fullPage: true });
await context.close();
