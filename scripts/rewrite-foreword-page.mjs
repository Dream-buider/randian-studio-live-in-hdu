import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\.pw-edge-profile';
const pageUrl = 'https://scnbcye3xdfz.feishu.cn/wiki/EsamwS4JCinpBWkW1ICcD1H9nPb';
const wikiToken = 'EsamwS4JCinpBWkW1ICcD1H9nPb';
const objToken = 'PCKEd8AvLoX1slxAWlvcEPvznRc';

const plain = `一个面向杭电学生的长期知识整理计划。

内容涉及：课程、实验室、竞赛、保研、转专业、项目，以及大学真正的运行方式。

“大学从来不缺资源。

缺的是：
有人告诉你，
资源在哪里。”

为什么会有 LIVE IN HDU

大学里的信息并不总是以清晰的方式出现。

课程怎么学，实验室怎么进，竞赛从哪里开始，转专业要看什么通知，保研要提前准备哪些材料。这些问题往往散落在群聊、经验帖、学长学姐的只言片语里。

LIVE IN HDU 想做的，是把这些分散的信息重新整理成可以被查找、被复用、被继续维护的知识。

大学不会主动给你说明书

大学给了人很多空间，也把很多判断交还给个人。

有些机会不会主动出现在课表里。有些规则不会在你需要它的时候才第一次解释清楚。你需要自己搜索、确认、比较，也需要知道该向哪里提问。

这个知识系统不是替你做决定，而是帮助你更早看见选择。

我们想留下什么

这里会长期整理新生经验、课程资料、实验室信息、学习路径，以及更长线的成长路线。

它不追求一次写完，也不追求看起来热闹。更重要的是：每一条信息都能被后来的人继续补充、修正和使用。

希望后来的人，能少走一些重复的路。

---

愿你最终拥有的，
不只是绩点。

也包括：
判断力、方向感，
以及构建自己的能力。`;

const html = `
<p>一个面向杭电学生的长期知识整理计划。</p>
<p>内容涉及：课程、实验室、竞赛、保研、转专业、项目，以及大学真正的运行方式。</p>
<blockquote>
  <p>大学从来不缺资源。</p>
  <p>缺的是：<br>有人告诉你，<br>资源在哪里。</p>
</blockquote>
<h2>为什么会有 LIVE IN HDU</h2>
<p>大学里的信息并不总是以清晰的方式出现。</p>
<p>课程怎么学，实验室怎么进，竞赛从哪里开始，转专业要看什么通知，保研要提前准备哪些材料。这些问题往往散落在群聊、经验帖、学长学姐的只言片语里。</p>
<p>LIVE IN HDU 想做的，是把这些分散的信息重新整理成可以被查找、被复用、被继续维护的知识。</p>
<h2>大学不会主动给你说明书</h2>
<p>大学给了人很多空间，也把很多判断交还给个人。</p>
<p>有些机会不会主动出现在课表里。有些规则不会在你需要它的时候才第一次解释清楚。你需要自己搜索、确认、比较，也需要知道该向哪里提问。</p>
<p>这个知识系统不是替你做决定，而是帮助你更早看见选择。</p>
<h2>我们想留下什么</h2>
<p>这里会长期整理新生经验、课程资料、实验室信息、学习路径，以及更长线的成长路线。</p>
<p>它不追求一次写完，也不追求看起来热闹。更重要的是：每一条信息都能被后来的人继续补充、修正和使用。</p>
<p>希望后来的人，能少走一些重复的路。</p>
<hr>
<p>愿你最终拥有的，<br>不只是绩点。</p>
<p>也包括：<br>判断力、方向感，<br>以及构建自己的能力。</p>
`;

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
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

const csrf = (await context.cookies()).find((cookie) => cookie.name === '_csrf_token')?.value;
const renameRes = await context.request.post('https://scnbcye3xdfz.feishu.cn/space/api/wiki/v2/tree/update_title/', {
  headers: {
    'content-type': 'application/json',
    'x-csrftoken': csrf,
    referer: pageUrl,
  },
  data: {
    wiki_token: wikiToken,
    obj_token: objToken,
    name: 'LIVE IN HDU',
  },
});
console.log('rename', renameRes.status(), await renameRes.text());

await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);

const editButton = page.getByRole('button', { name: '编辑' }).last();
if (await editButton.count()) {
  await editButton.click();
  await page.waitForTimeout(2500);
}

const bodyEditors = page.locator('.zone-container.text-editor');
const bodyEditor = bodyEditors.nth(1);
await bodyEditor.click({ position: { x: 120, y: 30 } });
await page.waitForTimeout(500);
await page.keyboard.press('Control+A');
await page.waitForTimeout(300);
await page.keyboard.press('Backspace');
await page.waitForTimeout(800);

let pastedRich = false;
try {
  await page.evaluate(async ({ html, plain }) => {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
  }, { html, plain });
  await page.keyboard.press('Control+V');
  pastedRich = true;
} catch (error) {
  console.log('rich paste failed', String(error));
  await page.keyboard.insertText(plain);
}

await page.waitForTimeout(10000);

const data = await page.evaluate(() => {
  const cleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();
  return {
    title: document.title,
    url: location.href,
    bodyText: cleanText(document.body.innerText).slice(0, 5000),
    richShape: {
      h1: [...document.querySelectorAll('h1')].map((el) => cleanText(el.innerText)),
      h2: [...document.querySelectorAll('h2')].map((el) => cleanText(el.innerText)),
      blockquoteCount: document.querySelectorAll('blockquote').length,
      hrCount: document.querySelectorAll('hr').length,
    },
  };
});

console.log(JSON.stringify({ pastedRich, data }, null, 2));
await page.screenshot({ path: 'C:\\Users\\Star\\Desktop\\杭电飞书社区\\foreword-page-rewritten.png', fullPage: true });
await context.close();
