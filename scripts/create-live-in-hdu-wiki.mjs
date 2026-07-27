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
await page.waitForTimeout(2000);
await page.getByText('空白知识库', { exact: true }).click();
await page.waitForTimeout(1000);
await page.getByText('下一步', { exact: true }).click();
await page.waitForTimeout(2500);

await page.getByPlaceholder('请输入名称').fill('LIVE IN HDU');
await page.getByPlaceholder('请输入简介').fill('杭州电子科技大学学生生活、学习资料与新生问答共建社区。');

const publicLabel = page.getByText(/所有人公开可见/).last();
if (await publicLabel.count()) {
  await publicLabel.click();
  await page.waitForTimeout(800);
}

await page.getByText('创建', { exact: true }).last().click();
await page.waitForTimeout(10000);

const data = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  return {
    title: document.title,
    url: location.href,
    bodyText: clean(document.body.innerText).slice(0, 5000),
  };
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\live-in-hdu-created.png', fullPage: true });
await context.close();
