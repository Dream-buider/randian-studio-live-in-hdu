import path from 'node:path';
import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(process.cwd(), '.pw-edge-profile');

const pageUrl = 'https://scnbcye3xdfz.feishu.cn/wiki/XI0hwjd9biAw6Kkz3afcmEGxn6g';
const wikiToken = 'XI0hwjd9biAw6Kkz3afcmEGxn6g';
const objToken = 'IBaPdLhWzoXFIPxiYiIcGP3znTd';
const newTitle = '🌈 LIVE IN HDU';

const links = {
  ask: 'https://ask.feishu.cn/',
  quick: 'https://scnbcye3xdfz.feishu.cn/wiki/LK3mwSENwiUw9qkntDrcyf6Dnsc',
  search: 'https://scnbcye3xdfz.feishu.cn/wiki/Swfjwn9GjiC0iHkFuAMcDZpbnBd',
  freshmanMust: 'https://scnbcye3xdfz.feishu.cn/wiki/Q3rwwOyn7iixTnkm6vRcNXatn9e',
  official: 'https://scnbcye3xdfz.feishu.cn/wiki/RaNZwBImAipEZvk3ZyfcZQsLnyb',
  rules: 'https://scnbcye3xdfz.feishu.cn/wiki/WTUDwO0jximZb5k8jJRcSEH0nFc',
  freshman: 'https://scnbcye3xdfz.feishu.cn/wiki/D1XDwzXHzij7cGkrqLqczfxKnQK',
  courses: 'https://scnbcye3xdfz.feishu.cn/wiki/QJBTwbEjBi2dHAkIYUhctR5gn6c',
  lab: 'https://scnbcye3xdfz.feishu.cn/wiki/OrrWwVnuRiTuCMkM558cB9FanZb',
  life: 'https://scnbcye3xdfz.feishu.cn/wiki/OJ6awgyosi1PxmkgCedcKk2LnVb',
  career: 'https://scnbcye3xdfz.feishu.cn/wiki/Xw2EwFV74inAGtkiyl7cQk0lnFc',
  contribute: 'https://scnbcye3xdfz.feishu.cn/wiki/XVWawcqdOi6B1fkVXtOcPHcMnpf',
};

const chunks = [
  {
    plain: `AI 速览
LIVE IN HDU 是面向杭电学生的校园知识库与问答入口，先把新生、课程、选课、实验室、生活、发展与就业、共建反馈等高频问题整理成可搜索、可引用、可继续维护的页面。

🎯 愿景和目标
让杭电同学查信息少走弯路。
把散在群聊、经验帖、通知里的信息，整理成可以被检索、被复用、被继续修正的知识。

🔖 简介 | LIVEINHDU
LIVE IN HDU 是一个面向杭电学生的长期知识整理计划。内容涉及新生入学、课程学习、选课学籍、实验室科研、校园生活、竞赛保研考研就业，以及大学真正的运行方式。

🥳 加入飞书知识问答
一句话提问，尽量获得答案和原文来源。入口：https://ask.feishu.cn/

🚗 加入社区三部曲
1. 使用知识库：先从左侧目录或快速导航进入问题场景。
2. 使用问答助手：遇到具体问题时，先提问，再回到原文核对来源。
3. 参与共建：发现缺漏、过期或错误信息，进入共建与反馈提交。

📝 欢迎投稿
欢迎投稿课程经验、实验室信息、校园生活路线、政策入口整理、资料索引和纠错反馈。`,
    html: `
<p><strong>AI 速览</strong></p>
<p>LIVE IN HDU 是面向杭电学生的校园知识库与问答入口，先把新生、课程、选课、实验室、生活、发展与就业、共建反馈等高频问题整理成可搜索、可引用、可继续维护的页面。</p>
<h1>🎯 愿景和目标</h1>
<p>让杭电同学查信息少走弯路。</p>
<p><strong>把散在群聊、经验帖、通知里的信息，整理成可以被检索、被复用、被继续修正的知识。</strong></p>
<h1>🔖 简介 | LIVEINHDU</h1>
<p>LIVE IN HDU 是一个面向杭电学生的长期知识整理计划。内容涉及新生入学、课程学习、选课学籍、实验室科研、校园生活、竞赛保研考研就业，以及大学真正的运行方式。</p>
<p><a href="${links.quick}">🏡 快速导航</a>｜<a href="${links.freshmanMust}">👋 新生必看</a>｜<a href="${links.rules}">📘 使用规则</a></p>
<p><strong>飞书知识库｜问答助手｜共建反馈</strong></p>
<h2>🥳 加入飞书知识问答</h2>
<p>一句话提问，尽量获得答案和原文来源。</p>
<p>📌 <a href="${links.ask}">提问入口</a>（后续配置为知识库固定问答入口后，会和参考页一样出现在左侧搜索下方。）</p>
<h2>🚗 加入社区三部曲</h2>
<p>» 1️⃣ 使用知识库：先从左侧目录或快速导航进入问题场景。</p>
<p>» 2️⃣ 使用问答助手：遇到具体问题时，先提问，再回到原文核对来源。</p>
<p>» 3️⃣ 参与共建：发现缺漏、过期或错误信息，进入共建与反馈提交。</p>
<h2>📝 欢迎投稿</h2>
<p>欢迎投稿课程经验、实验室信息、校园生活路线、政策入口整理、资料索引和纠错反馈。</p>
<p><a href="${links.contribute}">进入共建与反馈</a></p>`,
  },
  {
    plain: `🫐 社区最新栏目：
新生入学、课程复习、校园生活、实验室与科研、发展与就业。

📺 共学与更新
把高频问题沉淀成页面，把过期内容标记复核，把可靠来源放在显眼位置。

🎡 近期重点
优先补齐新生入学、学业与课程、校园生活三类内容。

🎏 近 7 日更新日志
5 月 24 日：复刻 WaytoAGI 首页布局，建立问答助手入口和快速导航。
5 月 18 日：完成 V1 信息架构重构。
5 月 13 日：创建 LIVE IN HDU 飞书知识库和初始目录。

💬 飞书 & 微信交流群
当前先以飞书知识库为主，交流群入口后续统一接入。

🏠 加入 LIVE IN HDU
先收藏知识库，再从“新生必看”和“快速导航”开始。`,
    html: `
<h2>🫐 社区最新栏目：</h2>
<p><a href="${links.freshman}">新生入学</a>｜<a href="${links.courses}">学业与课程</a>｜<a href="${links.life}">校园生活</a>｜<a href="${links.lab}">实验室与科研</a>｜<a href="${links.career}">发展与就业</a></p>
<h2>📺 共学与更新</h2>
<p>把高频问题沉淀成页面，把过期内容标记复核，把可靠来源放在显眼位置。</p>
<h2>🎡 近期重点</h2>
<p>优先补齐新生入学、学业与课程、校园生活三类内容。</p>
<h2>🎏 近 7 日更新日志</h2>
<p>5 月 24 日：复刻 WaytoAGI 首页布局，建立问答助手入口和快速导航。</p>
<p>5 月 18 日：完成 V1 信息架构重构。</p>
<p>5 月 13 日：创建 LIVE IN HDU 飞书知识库和初始目录。</p>
<h2>💬 飞书 & 微信交流群</h2>
<p>当前先以飞书知识库为主，交流群入口后续统一接入。</p>
<h2>🏠 加入 LIVE IN HDU</h2>
<p>先收藏知识库，再从<a href="${links.freshmanMust}">新生必看</a>和<a href="${links.quick}">快速导航</a>开始。</p>`,
  },
  {
    plain: `🙏 友情推荐
杭电25新生指北：https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd

👬 社区共建伙伴
学生投稿、同学复核、维护者发布。

😊 我应该从哪里开始？
如果你是新生，看“新生必看”。如果你正在找资料，看“学业与课程”。如果你只想问一句话，先用问答助手。

🧭 快速导航
0．起点
1. 新生入学
2. 学业与课程
3. 校园生活
4. 发展与就业

📅 周刊与维护
页面会持续补充来源、复核时间、可靠等级和贡献者记录。

🎯 愿景和目标
让后来的人少走重复的路。`,
    html: `
<h2>🙏 友情推荐</h2>
<p><a href="https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd">杭电25新生指北</a></p>
<h2>👬 社区共建伙伴</h2>
<p>学生投稿、同学复核、维护者发布。</p>
<h2>😊 我应该从哪里开始？</h2>
<p>如果你是新生，看“新生必看”。如果你正在找资料，看“学业与课程”。如果你只想问一句话，先用问答助手。</p>
<h1>🧭 快速导航</h1>
<h2>0．起点</h2>
<p><a href="${links.quick}">快速导航</a>｜<a href="${links.search}">搜索指南</a>｜<a href="${links.official}">官方入口</a>｜<a href="${links.rules}">使用规则</a></p>
<h2>1. 新生入学</h2>
<p><a href="${links.freshmanMust}">新生必看</a>｜<a href="${links.freshman}">新生入学目录</a></p>
<h2>2. 学业与课程</h2>
<p><a href="${links.courses}">课程复习、历年卷、程序设计、英语四六级</a></p>
<h2>3. 校园生活</h2>
<p><a href="${links.life}">校园卡、网络水电、快递外卖、食堂超市、交通地图</a></p>
<h2>4. 发展与就业</h2>
<p><a href="${links.career}">竞赛、保研、考研、实习、秋招春招、项目作品集</a></p>
<h1>📅 周刊与维护</h1>
<p>页面会持续补充来源、复核时间、可靠等级和贡献者记录。</p>
<h1>🎯 愿景和目标</h1>
<p>让后来的人少走重复的路。</p>`,
  },
];

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

async function getCsrf(context) {
  return (await context.cookies()).find((cookie) => cookie.name === '_csrf_token')?.value;
}

async function pasteChunk(page, chunk) {
  await page.evaluate(async ({ html, plain }) => {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
  }, chunk);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(4500);
}

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 819 },
  args: ['--start-maximized'],
});

await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
  origin: 'https://scnbcye3xdfz.feishu.cn',
});

const page = context.pages()[0] ?? await context.newPage();
await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);

const csrf = await getCsrf(context);
let renameResult = { status: 'skipped', body: 'Title already set or API unavailable.' };
try {
  const renameRes = await context.request.post('https://scnbcye3xdfz.feishu.cn/space/api/wiki/v2/tree/update_title/', {
    headers: {
      'content-type': 'application/json',
      'x-csrftoken': csrf,
      referer: pageUrl,
    },
    data: {
      wiki_token: wikiToken,
      obj_token: objToken,
      name: newTitle,
    },
  });
  renameResult = { status: renameRes.status(), body: await renameRes.text() };
} catch (error) {
  renameResult = { status: 'failed', body: String(error) };
}

await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);

const editButton = page.getByRole('button', { name: '编辑' }).last();
if (await editButton.count()) {
  await editButton.click();
  await page.waitForTimeout(2500);
}

const bodyEditors = page.locator('.zone-container.text-editor');
const bodyEditorCount = await bodyEditors.count();
if (bodyEditorCount < 2) {
  throw new Error(`Cannot find body editor. Found ${bodyEditorCount} text editors.`);
}

await bodyEditors.nth(1).click({ position: { x: 80, y: 20 } });
await page.waitForTimeout(500);
await page.keyboard.press('Control+Home');
await page.waitForTimeout(250);
await page.keyboard.press('Control+Shift+End');
await page.waitForTimeout(500);
await page.keyboard.press('Backspace');
await page.waitForTimeout(2500);

for (const [index, chunk] of chunks.entries()) {
  if (index > 0) {
    await page.keyboard.press('Control+End');
    await page.waitForTimeout(600);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  await pasteChunk(page, chunk);
}

await page.waitForTimeout(14000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);

const result = await page.evaluate(() => {
  const cleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();
  return {
    title: document.title,
    url: location.href,
    bodyText: cleanText(document.body.innerText).slice(0, 12000),
    catalogue: [...document.querySelectorAll('.catalogue__item-title')]
      .map((el) => cleanText(el.innerText))
      .filter(Boolean),
    textEditors: [...document.querySelectorAll('.zone-container.text-editor')]
      .map((el) => cleanText(el.innerText))
      .filter(Boolean)
      .slice(0, 60),
    blockClasses: [...document.querySelectorAll('.block')]
      .map((el) => el.className?.toString?.() || '')
      .filter(Boolean)
      .slice(0, 80),
  };
});

console.log(JSON.stringify({
  renamed: renameResult,
  hasAsk: result.bodyText.includes('飞书知识问答') || result.bodyText.includes('提问入口'),
  hasQuickNav: result.bodyText.includes('快速导航'),
  hasNoOldTemplate: !result.bodyText.includes('这里你可以描述知识空间建设的目标'),
  hasBottomSections: result.bodyText.includes('周刊与维护') || result.catalogue.includes('📅 周刊与维护'),
  result,
}, null, 2));

await page.screenshot({ path: path.join(process.cwd(), 'live-in-hdu-waytoagi-layout.png'), fullPage: true });
await context.close();
