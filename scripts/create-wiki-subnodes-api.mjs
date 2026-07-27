import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\.pw-edge-profile';
const originUrl = 'https://scnbcye3xdfz.feishu.cn/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc';
const spaceId = '7639362813286190049';

const parents = {
  'D1XDwzXHzij7cGkrqLqczfxKnQK': ['报到前准备清单', '到校当天流程', '寝室床铺与生活用品', '校园卡网络与水电', '快递外卖与打印', '食堂超市与周边', '校园地图与通勤'],
  'QJBTwbEjBi2dHAkIYUhctR5gn6c': ['高数复习指南', '线性代数复习指南', '大学物理复习指南', '程序设计基础指南', '英语四六级备考', '课程资料投稿区'],
  'AHNcw3RRPijtvkkOfnkcWoclnLd': ['选课时间线', '通识课与体育课', '重修补考缓考', '转专业流程', '培养方案入口'],
  'OrrWwVnuRiTuCMkM558cB9FanZb': ['竞赛入门', '实验室与科研', '保研路径', '考研路径', '实习就业'],
  'OJ6awgyosi1PxmkgCedcKk2LnVb': ['社团组织', '校园活动', '杭州生活', '租房兼职与安全提醒'],
  'XVWawcqdOi6B1fkVXtOcPHcMnpf': ['如何投稿', '内容规范', '贡献者名单', '更新日志', '反馈与纠错'],
  'Xw2EwFV74inAGtkiyl7cQk0lnFc': ['新生常见问题', '学业常见问题', '生活常见问题', '问答维护规则']
};

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 819 },
  args: ['--start-maximized'],
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const csrf = (await context.cookies()).find((c) => c.name === '_csrf_token')?.value;

const results = [];
for (const [parentToken, titles] of Object.entries(parents)) {
  for (const title of titles) {
    const result = await page.evaluate(async ({ spaceId, parentToken, title, csrf }) => {
      const res = await fetch('/space/api/wiki/v2/tree/create_node/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrftoken': csrf,
          'docs-host-id': parentToken,
          'docs-host-type': 'Wiki',
          'doc-platform': 'web',
          'x-lsc-terminal': 'web',
        },
        body: JSON.stringify({
          space_id: spaceId,
          parent_wiki_token: parentToken,
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
      try { return JSON.parse(text); } catch { return { raw: text }; }
    }, { spaceId, parentToken, title, csrf });
    results.push({ parentToken, title, result });
    await page.waitForTimeout(400);
  }
}

console.log(JSON.stringify(results, null, 2));
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\wiki-subnodes-created-api.png', fullPage: true });
await context.close();
