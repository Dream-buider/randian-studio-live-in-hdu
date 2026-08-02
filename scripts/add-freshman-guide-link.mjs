import path from 'node:path';
import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(process.cwd(), '.pw-edge-profile');
const originUrl = 'https://scnbcye3xdfz.feishu.cn/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc';
const rootToken = 'I0OwwcBeLiIHZOkmpTScv0MEnyc';
const startToken = 'XI0hwjd9biAw6Kkz3afcmEGxn6g';
const targetTitle = '新生必看';
const guideTitle = '杭电25新生指北';
const guideUrl = 'https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd';

const plain = `${guideTitle}

入口：${guideUrl}

简介：面向 2025 级杭电新生的入学参考资料，适合在报到前后快速查看校园生活、入学准备和常见问题。内容来自外部飞书知识库，社区暂作为推荐入口收录；具体时间、流程和政策仍以学校、学院当年正式通知为准。

适合谁看：2025 级本科新生、研究生新生，以及正在帮新生整理入学信息的同学。

使用建议：先用它建立对开学事项的整体印象，再回到 LIVE IN HDU 的“新生入学”栏目按事项查报到、寝室、校园卡、网络、快递、食堂和地图等信息。`;

const html = `
<h2>${guideTitle}</h2>
<p><a href="${guideUrl}">打开 ${guideTitle}</a></p>
<p><strong>简介：</strong>面向 2025 级杭电新生的入学参考资料，适合在报到前后快速查看校园生活、入学准备和常见问题。内容来自外部飞书知识库，社区暂作为推荐入口收录；具体时间、流程和政策仍以学校、学院当年正式通知为准。</p>
<p><strong>适合谁看：</strong>2025 级本科新生、研究生新生，以及正在帮新生整理入学信息的同学。</p>
<p><strong>使用建议：</strong>先用它建立对开学事项的整体印象，再回到 LIVE IN HDU 的“新生入学”栏目按事项查报到、寝室、校园卡、网络、快递、食堂和地图等信息。</p>
`;

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

async function fetchTree(page, wikiToken) {
  return page.evaluate(async (token) => {
    const url = `/space/api/wiki/v2/tree/get_info/?wiki_token=${token}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=true`;
    const res = await fetch(url, { credentials: 'include' });
    return res.json();
  }, wikiToken);
}

async function findNodeByTitle(page, startToken, title) {
  const queue = [startToken];
  const seen = new Set();
  const visitedTitles = [];

  while (queue.length > 0) {
    const token = queue.shift();
    if (!token || seen.has(token)) continue;
    seen.add(token);

    const data = await fetchTree(page, token);
    if (data.code !== 0 || !data.data?.tree) continue;

    const tree = data.data.tree;
    for (const node of Object.values(tree.nodes)) {
      if (!node?.wiki_token || seen.has(node.wiki_token)) continue;
      visitedTitles.push(node.title);
      if (node.title === title) {
        return { node, visitedTitles };
      }
    }

    for (const childTokens of Object.values(tree.child_map || {})) {
      for (const childToken of childTokens || []) {
        if (!seen.has(childToken)) queue.push(childToken);
      }
    }
  }

  return { node: null, visitedTitles };
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
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

let { node, visitedTitles } = await findNodeByTitle(page, rootToken, targetTitle);
if (!node?.wiki_token) {
  const found = await findNodeByTitle(page, startToken, targetTitle);
  node = found.node;
  visitedTitles = [...visitedTitles, ...found.visitedTitles];
}
if (!node?.wiki_token) {
  throw new Error(`Cannot find wiki page titled ${targetTitle}. Visited: ${visitedTitles.filter(Boolean).join(' / ')}`);
}

const pageUrl = `https://scnbcye3xdfz.feishu.cn/wiki/${node.wiki_token}`;
await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);

let beforeText = clean(await page.locator('body').innerText()).slice(0, 6000);
let alreadyPresent = beforeText.includes(guideTitle) || beforeText.includes(guideUrl);

if (!alreadyPresent) {
  const editButton = page.getByRole('button', { name: '编辑' }).last();
  if (await editButton.count()) {
    await editButton.click();
    await page.waitForTimeout(1800);
  }

  await page.mouse.click(580, 340);
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  try {
    await page.evaluate(async ({ html, plain }) => {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
    }, { html, plain });
    await page.keyboard.press('Control+V');
  } catch (error) {
    console.log('rich paste failed; using plain text', String(error));
    await page.keyboard.insertText(plain);
  }

  await page.waitForTimeout(10000);
}

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const afterText = clean(await page.locator('body').innerText()).slice(0, 8000);
const result = {
  targetTitle,
  pageUrl,
  targetToken: node.wiki_token,
  alreadyPresent,
  inserted: !alreadyPresent,
  hasGuideTitle: afterText.includes(guideTitle),
  hasGuideUrl: afterText.includes(guideUrl),
  preview: afterText.slice(0, 1200),
};

console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: path.join(process.cwd(), 'freshman-guide-added.png'), fullPage: true });
await context.close();
