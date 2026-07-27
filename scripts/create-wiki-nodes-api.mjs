import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\.pw-edge-profile';
const originUrl = 'https://scnbcye3xdfz.feishu.cn/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc';

const spaceId = '7639362813286190049';
const rootToken = 'I0OwwcBeLiIHZOkmpTScv0MEnyc';

const pages = [
  'LIVE IN HDU 首页',
  '新生生存指南',
  '学业资料库',
  '选课与培养',
  '成长发展',
  '校园生活',
  '共建社区',
  '知识问答与 FAQ'
];

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 819 },
  args: ['--start-maximized'],
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const results = [];
const csrf = (await context.cookies()).find((c) => c.name === '_csrf_token')?.value;
for (const title of pages) {
  const result = await page.evaluate(async ({ spaceId, rootToken, title, csrf }) => {
    const res = await fetch('/space/api/wiki/v2/tree/create_node/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrftoken': csrf,
        'docs-host-id': rootToken,
        'docs-host-type': 'Wiki',
        'doc-platform': 'web',
        'x-lsc-terminal': 'web',
      },
      body: JSON.stringify({
        space_id: spaceId,
        parent_wiki_token: rootToken,
        ua_type: 'Web',
        scene: 'wiki_create',
        obj_type: 22,
        node_type: 0,
        synergy_uuid: String(Date.now()),
        template_token: '',
        title,
      }),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }, { spaceId, rootToken, title, csrf });
  results.push({ title, result });
  await page.waitForTimeout(800);
}

console.log(JSON.stringify(results, null, 2));
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\wiki-nodes-created-api.png', fullPage: true });
await context.close();
