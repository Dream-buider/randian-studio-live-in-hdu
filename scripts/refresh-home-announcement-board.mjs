import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(root, '.pw-edge-profile');
const outputDir = path.join(root, 'output', 'playwright');
const origin = 'https://scnbcye3xdfz.feishu.cn';

const pages = {
  home: {
    title: '🌈 LIVE IN HDU',
    url: `${origin}/wiki/XI0hwjd9biAw6Kkz3afcmEGxn6g`,
    wikiToken: 'XI0hwjd9biAw6Kkz3afcmEGxn6g',
    objToken: 'IBaPdLhWzoXFIPxiYiIcGP3znTd',
  },
  changelog: {
    title: '更新日志',
    url: `${origin}/wiki/T8RcwgsUQi4JKUkTU2tcnCyYnBh`,
  },
};

const links = {
  ask: 'https://ask.feishu.cn/',
  quick: `${origin}/wiki/LK3mwSENwiUw9qkntDrcyf6Dnsc`,
  search: `${origin}/wiki/Swfjwn9GjiC0iHkFuAMcDZpbnBd`,
  freshmanMust: `${origin}/wiki/Q3rwwOyn7iixTnkm6vRcNXatn9e`,
  freshman: `${origin}/wiki/D1XDwzXHzij7cGkrqLqczfxKnQK`,
  courses: `${origin}/wiki/QJBTwbEjBi2dHAkIYUhctR5gn6c`,
  courseReview: `${origin}/wiki/EdTqwwPDwiuNuwkJjUecYCB5ncf`,
  majorChange: `${origin}/wiki/MPVlwJhSLiUZVUkNP7ucuxpqnOf`,
  trainingPlan: `${origin}/wiki/HC1iwI8G8ixT24kHbaUcnxTlnGe`,
  innovation: `${origin}/wiki/IFbpweKm3i2moRkoyDScBez9nOd`,
  life: `${origin}/wiki/OJ6awgyosi1PxmkgCedcKk2LnVb`,
  map: `${origin}/wiki/DwFKwfiKfiqas4kW0cWc4L1QnFg`,
  dorm: `${origin}/wiki/Dee9wpHwQiCnL3kjrLQcKV12nDe`,
  contribute: `${origin}/wiki/XVWawcqdOi6B1fkVXtOcPHcMnpf`,
  feedback: `${origin}/wiki/CQ0jwTJGFit3YRk3rjqcYRjfn0O`,
  changelog: pages.changelog.url,
};

const homeChunks = [
  {
    plain: `📣 先看这里
如果你是第一次点进来，或者在手机端不想翻左侧导航，先看这 4 个入口：
1. AI 问答助手
2. 期末复习资料
3. 2026 年大创项目申报
4. 转专业 / 培养方案

🤖 AI 问答助手（最优先）
不会找栏目、懒得翻导航、只想直接问一句时，先点这里。
立即提问：${links.ask}
你可以直接问：
- 期末复习资料在哪？
- 大创申报怎么开始？
- 转专业通知在哪看？
- 新生先从哪里看？

🔥 当前最重要的 3 件事
1. 期末月复习资料
高数、线代、概率论、离散、大物、大学英语、电工等资料已经整理到课程复习页。
入口：${links.courseReview}

2. 2026 年大创项目申报
最近有申报需求的同学，可以直接进申报页看通知原文。
入口：${links.innovation}

3. 转专业 / 培养方案
如果你最近在看转专业、培养方案、英语免修、体育理论考试，这一批新资料已经补进知识库。
转专业：${links.majorChange}
培养方案：${links.trainingPlan}`,
    html: `
<blockquote><strong>📣 先看这里：如果你是第一次点进来，或者在手机端不想翻左侧导航，先看这 4 个入口：AI 问答助手、期末复习资料、2026 年大创项目申报、转专业 / 培养方案。</strong></blockquote>
<h2>🤖 AI 问答助手（最优先）</h2>
<p>不会找栏目、懒得翻导航、只想直接问一句时，先点这里。</p>
<p>👉 <a href="${links.ask}">立即提问</a></p>
<ul>
  <li>期末复习资料在哪？</li>
  <li>大创申报怎么开始？</li>
  <li>转专业通知在哪看？</li>
  <li>新生先从哪里看？</li>
</ul>
<h2>🔥 当前最重要的 3 件事</h2>
<p><strong>1. 期末月复习资料</strong><br />高数、线代、概率论、离散、大物、大学英语、电工等资料已经整理到课程复习页。<br />👉 <a href="${links.courseReview}">进入课程复习</a></p>
<p><strong>2. 2026 年大创项目申报</strong><br />最近有申报需求的同学，可以直接进申报页看通知原文。<br />👉 <a href="${links.innovation}">进入大创项目申报</a></p>
<p><strong>3. 转专业 / 培养方案</strong><br />如果你最近在看转专业、培养方案、英语免修、体育理论考试，这一批新资料已经补进知识库。<br />👉 <a href="${links.majorChange}">转专业申请</a> ｜ <a href="${links.trainingPlan}">培养方案</a></p>`,
  },
  {
    plain: `🎮 一进来先做什么
第一步：如果你连该看哪个栏目都不确定，先问 AI。
第二步：如果你知道自己要找什么，直接走下面的快捷入口。
第三步：如果你发现内容过期或不全，去共建与反馈告诉我们。

🧭 不想找左侧导航？常用入口直达
新生必看：${links.freshmanMust}
快速导航：${links.quick}
搜索指南：${links.search}
课程复习：${links.courseReview}
学业与课程总入口：${links.courses}
校园生活：${links.life}
宿舍信息：${links.dorm}
学校地图：${links.map}

📚 这个知识库现在能帮你做什么
- 先给你一个能直接点进去的入口
- 尽量把高频问题放到第一屏
- 尽量把政策类内容和原始通知放在一起
- 让手机端用户不必先理解整个目录结构`,
    html: `
<h2>🎮 一进来先做什么</h2>
<ol>
  <li>如果你连该看哪个栏目都不确定，先问 AI。</li>
  <li>如果你知道自己要找什么，直接走下面的快捷入口。</li>
  <li>如果你发现内容过期或不全，去共建与反馈告诉我们。</li>
</ol>
<h2>🧭 不想找左侧导航？常用入口直达</h2>
<p><a href="${links.freshmanMust}">👋 新生必看</a> ｜ <a href="${links.quick}">🏡 快速导航</a> ｜ <a href="${links.search}">🔎 搜索指南</a></p>
<p><a href="${links.courseReview}">🔥 课程复习</a> ｜ <a href="${links.courses}">📘 学业与课程总入口</a> ｜ <a href="${links.life}">🏫 校园生活</a></p>
<p><a href="${links.dorm}">🛏 宿舍信息</a> ｜ <a href="${links.map}">🗺 学校地图</a></p>
<h2>📚 这个知识库现在能帮你做什么</h2>
<ul>
  <li>先给你一个能直接点进去的入口。</li>
  <li>尽量把高频问题放到第一屏。</li>
  <li>尽量把政策类内容和原始通知放在一起。</li>
  <li>让手机端用户不必先理解整个目录结构。</li>
</ul>`,
  },
  {
    plain: `📅 最近更新日志
2026-06-02
- 更新电子电工复习页，补充电子技术基础习题及实验指导、授课计划等资料。
- 新增校园生活 / 外卖 / 美食红黑榜，整理下沙外卖互助表、群内推荐和避雷摘录。

2026-05-31
- 首页改成公告栏结构，AI 问答助手、期末复习、大创申报前置到第一屏。
- 新增第二批资料 31 份，补齐毕业与学位、党团与实践、奖助与评优等入口。

2026-05-28
- 发布期末复习专区，覆盖高数、线代、概率论与数理统计、离散数学、大学物理、大学英语。
- 大学物理 334 张题图整理为三册可打印 PDF。

2026-05-24
- 首页改成门户布局，补了快速导航、问答入口和新生指北。

2026-05-18
- 完成 LIVE IN HDU V1 信息架构重构。

📝 投稿 / 纠错 / 共建
如果你发现信息过期、链接失效、资料缺失，欢迎直接反馈。
共建与反馈：${links.contribute}
纠错反馈：${links.feedback}
完整更新日志：${links.changelog}`,
    html: `
<h2>📅 最近更新日志</h2>
<p><strong>2026-06-02</strong><br />- 更新电子电工复习页，补充电子技术基础习题及实验指导、授课计划等资料。<br />- 新增校园生活 / 外卖 / 美食红黑榜，整理下沙外卖互助表、群内推荐和避雷摘录。</p>
<p><strong>2026-05-31</strong><br />- 首页改成公告栏结构，AI 问答助手、期末复习、大创申报前置到第一屏。<br />- 新增第二批资料 31 份，补齐毕业与学位、党团与实践、奖助与评优等入口。</p>
<p><strong>2026-05-28</strong><br />- 发布期末复习专区，覆盖高数、线代、概率论与数理统计、离散数学、大学物理、大学英语。<br />- 大学物理 334 张题图整理为三册可打印 PDF。</p>
<p><strong>2026-05-24</strong><br />- 首页改成门户布局，补了快速导航、问答入口和新生指北。</p>
<p><strong>2026-05-18</strong><br />- 完成 LIVE IN HDU V1 信息架构重构。</p>
<h2>📝 投稿 / 纠错 / 共建</h2>
<p>如果你发现信息过期、链接失效、资料缺失，欢迎直接反馈。</p>
<p><a href="${links.contribute}">🤝 共建与反馈</a> ｜ <a href="${links.feedback}">🛠 纠错反馈</a> ｜ <a href="${links.changelog}">📜 完整更新日志</a></p>`,
  },
];

const changelogChunks = [
  {
    plain: `更新日志
这里记录 LIVE IN HDU 的重要结构调整、内容补充和首页改版。

2026-06-02
1. 电子电工复习页补充完成
- 在学业与课程 / 课程复习下更新期末复习 | 电子电工。
- 补充电子技术基础（电工学下册）习题及实验指导、具身智能实验班授课计划 2 份资料。

2. 外卖互助整理上线
- 在校园生活 / 外卖下新增美食红黑榜 | 下沙外卖互助。
- 页面整理了 WPS 协作文档入口、群内推荐、避雷摘录和点单参考。

3. 发布边界说明
- 群聊截图与外卖订单截图仅作为内部整理参考，未作为飞书附件公开上传。

2026-05-31
1. 首页改版为公告栏结构
- 将 AI 问答助手、期末复习资料、2026 年大创项目申报、转专业 / 培养方案前置到首页第一屏。
- 调整首页信息顺序，让移动端用户不必先依赖左侧导航。

2. 第二批资料发布完成
- 新增 17 个三级页面，发布 31 份资料。
- 新增二级导航：毕业与学位、党团与实践、奖助与评优。

3. 本地整理
- 清理第二批上传源目录、历史截图和浏览器缓存，保留自动化脚本与控制文档。`,
    html: `
<h1>更新日志</h1>
<p>这里记录 LIVE IN HDU 的重要结构调整、内容补充和首页改版。</p>
<h2>2026-06-02</h2>
<p><strong>1. 电子电工复习页补充完成</strong><br />- 在学业与课程 / 课程复习下更新期末复习 | 电子电工。<br />- 补充电子技术基础（电工学下册）习题及实验指导、具身智能实验班授课计划 2 份资料。</p>
<p><strong>2. 外卖互助整理上线</strong><br />- 在校园生活 / 外卖下新增美食红黑榜 | 下沙外卖互助。<br />- 页面整理了 WPS 协作文档入口、群内推荐、避雷摘录和点单参考。</p>
<p><strong>3. 发布边界说明</strong><br />- 群聊截图与外卖订单截图仅作为内部整理参考，未作为飞书附件公开上传。</p>
<h2>2026-05-31</h2>
<p><strong>1. 首页改版为公告栏结构</strong><br />- 将 AI 问答助手、期末复习资料、2026 年大创项目申报、转专业 / 培养方案前置到首页第一屏。<br />- 调整首页信息顺序，让移动端用户不必先依赖左侧导航。</p>
<p><strong>2. 第二批资料发布完成</strong><br />- 新增 17 个三级页面，发布 31 份资料。<br />- 新增二级导航：毕业与学位、党团与实践、奖助与评优。</p>
<p><strong>3. 本地整理</strong><br />- 清理第二批上传源目录、历史截图和浏览器缓存，保留自动化脚本与控制文档。</p>`,
  },
  {
    plain: `2026-05-28
1. 期末复习专区上线
- 在学业与课程 / 课程复习下新增 6 个期末复习入口。
- 发布 106 份有效附件。

2. 大学物理专题整理
- 将 334 张题图整理为三册可打印 PDF。

2026-05-24
1. 首页门户化
- 补充快速导航、问答入口、新生指北和首页正文模块。

2026-05-18
1. 知识库结构重构
- 完成 V1 信息架构重构，统一为学生问题路径式目录。`,
    html: `
<h2>2026-05-28</h2>
<p><strong>1. 期末复习专区上线</strong><br />- 在学业与课程 / 课程复习下新增 6 个期末复习入口。<br />- 发布 106 份有效附件。</p>
<p><strong>2. 大学物理专题整理</strong><br />- 将 334 张题图整理为三册可打印 PDF。</p>
<h2>2026-05-24</h2>
<p><strong>1. 首页门户化</strong><br />- 补充快速导航、问答入口、新生指北和首页正文模块。</p>
<h2>2026-05-18</h2>
<p><strong>1. 知识库结构重构</strong><br />- 完成 V1 信息架构重构，统一为学生问题路径式目录。</p>`,
  },
];

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

async function setClipboard(page, plain, html) {
  await page.evaluate(async ({ plain, html }) => {
    const item = new ClipboardItem({
      'text/plain': new Blob([plain], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    });
    await navigator.clipboard.write([item]);
  }, { plain, html });
}

async function enterEditMode(page) {
  const editButton = page.getByRole('button', { name: '编辑' }).last();
  if (await editButton.count()) {
    await editButton.click();
    await page.waitForTimeout(2500);
  }
}

async function ensureTitle(context, spec) {
  if (!spec.wikiToken || !spec.objToken || !spec.title) return;
  const csrf = (await context.cookies()).find((cookie) => cookie.name === '_csrf_token')?.value;
  if (!csrf) throw new Error(`Missing CSRF token while updating title for ${spec.title}`);
  const response = await context.request.post(`${origin}/space/api/wiki/v2/tree/update_title/`, {
    headers: {
      'content-type': 'application/json',
      'x-csrftoken': csrf,
      referer: spec.url,
    },
    data: {
      wiki_token: spec.wikiToken,
      obj_token: spec.objToken,
      name: spec.title,
    },
  });
  if (response.status() >= 300) {
    throw new Error(`Failed to update title for ${spec.title}: ${response.status()} ${await response.text()}`);
  }
}

async function replaceBody(page, chunks) {
  const editors = page.locator('.zone-container.text-editor');
  const count = await editors.count();
  if (count < 1) {
    throw new Error(`Cannot find body editor. Found ${count} text editors.`);
  }

  const body = editors.nth(count === 1 ? 0 : 1);
  await body.click({ position: { x: 80, y: 20 } });
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+Shift+End');
  await page.waitForTimeout(500);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(2200);

  for (let index = 0; index < chunks.length; index += 1) {
    if (index > 0) {
      await page.keyboard.press('Control+End');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }
    await setClipboard(page, chunks[index].plain, chunks[index].html);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(2600);
  }
}

async function setPageTitleEditor(page, title) {
  const editors = page.locator('.zone-container.text-editor');
  const count = await editors.count();
  if (count < 1) throw new Error('Cannot find title editor.');
  await editors.nth(0).click({ position: { x: 80, y: 16 } });
  await page.waitForTimeout(400);
  await setClipboard(page, title, title);
  await page.keyboard.press('Control+A');
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(1500);
}

async function updatePage(page, spec, chunks, screenshotName, assertions) {
  await page.goto(spec.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await enterEditMode(page);
  if (spec.title) {
    await setPageTitleEditor(page, spec.title);
  }
  await replaceBody(page, chunks);
  if (spec.title) {
    await setPageTitleEditor(page, spec.title);
  }
  await page.waitForTimeout(12000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const summary = await page.evaluate(() => {
    const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
    return {
      bodyText: normalize(document.body.innerText),
      headings: [...document.querySelectorAll('h1,h2,h3')]
        .map((el) => normalize(el.innerText))
        .filter(Boolean),
    };
  });

  for (const assertion of assertions) {
    if (!summary.bodyText.includes(assertion)) {
      throw new Error(`Verification failed for ${spec.title}: missing "${assertion}"`);
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, screenshotName),
    fullPage: true,
  });

  return {
    page: spec.title,
    url: spec.url,
    headings: summary.headings.slice(0, 20),
  };
}

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 900 },
  args: ['--start-maximized'],
});

await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = context.pages()[0] ?? await context.newPage();

const results = [];
await ensureTitle(context, pages.home);
results.push(await updatePage(
  page,
  pages.home,
  homeChunks,
  'home-announcement-board-2026-06-02.png',
  ['AI 问答助手', '期末月复习资料', '2026 年大创项目申报', '最近更新日志'],
));
results.push(await updatePage(
  page,
  pages.changelog,
  changelogChunks,
  'home-changelog-page-2026-06-02.png',
  ['2026-06-02', '电子电工复习页补充完成', '外卖互助整理上线'],
));

console.log(JSON.stringify({
  updatedAt: '2026-06-02',
  results,
}, null, 2));

await context.close();
