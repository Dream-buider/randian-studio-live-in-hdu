import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(root, '.pw-edge-profile');
const outputDir = path.join(root, 'output', 'playwright');
const reportDir = path.join(root, 'docs', '社区更新_2026-06-02');
const origin = 'https://scnbcye3xdfz.feishu.cn';
const originUrl = `${origin}/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc`;
const spaceId = '7639362813286190049';
const publishDate = '2026-06-02';
const onlyPage = process.env.ONLY_PAGE || 'all';

const parentTokens = {
  courseReview: 'EdTqwwPDwiuNuwkJjUecYCB5ncf',
  delivery: 'At2bwkJ50iiP4ckZmMtcMJGHnjN',
};

const courseSpec = {
  parentToken: parentTokens.courseReview,
  title: '期末复习 | 电子电工',
  previousTitles: ['电工复习资料'],
  summaryMarker: `本次补充于 ${publishDate}`,
  sectionMarker: '附件分组：电子电工补充资料',
  summaryPlain: [
    `更新说明（${publishDate}）`,
    '本次补充电子电工相关复习资料，并将原有电工页并入更明确的电子电工复习入口。',
    '适合查看：准备《电工与电子技术》或电子电工相关课程复习的同学。',
    '使用前请注意：资料仅作复习参考，考试范围、授课进度、作业要求与最终评分标准请以任课教师和学院通知为准。',
    `整理记录：本次补充于 ${publishDate}。`,
  ].join('\n'),
  summaryHtml: [
    `<h2>更新说明（${publishDate}）</h2>`,
    '<p>本次补充电子电工相关复习资料，并将原有电工页并入更明确的电子电工复习入口。</p>',
    '<blockquote><strong>适合查看：</strong>准备《电工与电子技术》或电子电工相关课程复习的同学。</blockquote>',
    '<blockquote><strong>使用前请注意：</strong>资料仅作复习参考，考试范围、授课进度、作业要求与最终评分标准请以任课教师和学院通知为准。</blockquote>',
    `<p><strong>整理记录：</strong>本次补充于 ${publishDate}。</p>`,
  ].join(''),
  sectionDescription: '补充《电子技术基础（电工学下册）》习题及实验指导，以及具身智能实验班《电工与电子技术》授课计划，方便在一个入口里同时看资料与进度。',
  files: [
    path.join(root, '本次更新', '电子技术基础（电工学下册）习题及实验指导(1).pdf'),
    path.join(root, '本次更新', '授课计划--具身智能实验班.doc'),
  ],
};

const foodSpec = {
  parentToken: parentTokens.delivery,
  title: '美食红黑榜 | 下沙外卖互助',
  wpsUrl: 'https://www.kdocs.cn/l/cb17FeBLYim6',
  verificationMarker: `本页整理于 ${publishDate}，原始群聊与订单截图仅作内部参考，未作为附件公开上传。`,
};

function clean(text) {
  return (text || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function fetchTree(page, token) {
  return page.evaluate(async (wikiToken) => {
    const response = await fetch(`/space/api/wiki/v2/tree/get_info/?wiki_token=${wikiToken}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=true`, { credentials: 'include' });
    return response.json();
  }, token);
}

function childNodes(treeData, parentToken) {
  return (treeData.data.tree.child_map[parentToken] || [])
    .map((token) => treeData.data.tree.nodes[token])
    .filter(Boolean);
}

async function renameNode(page, csrf, wikiToken, title) {
  const result = await page.evaluate(async ({ wikiToken, title, csrfToken, referer }) => {
    const response = await fetch('/space/api/wiki/v2/tree/update_title/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrftoken': csrfToken,
        referer,
      },
      body: JSON.stringify({ wiki_token: wikiToken, obj_token: '', name: title }),
    });
    return { status: response.status, text: await response.text() };
  }, { wikiToken, title, csrfToken: csrf, referer: originUrl });
  if (result.status >= 300) throw new Error(`Cannot rename ${wikiToken} to ${title}: ${result.status} ${result.text}`);
}

async function createNode(page, csrf, parentToken, title) {
  const result = await page.evaluate(async ({ spaceIdValue, parentTokenValue, titleValue, csrfToken }) => {
    const response = await fetch('/space/api/wiki/v2/tree/create_node/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrftoken': csrfToken,
        'docs-host-id': parentTokenValue,
        'docs-host-type': 'Wiki',
        'doc-platform': 'web',
        'x-lsc-terminal': 'web',
      },
      body: JSON.stringify({
        space_id: spaceIdValue,
        parent_wiki_token: parentTokenValue,
        ua_type: 'Web',
        scene: 'wiki_create',
        obj_type: 22,
        node_type: 0,
        synergy_uuid: String(Date.now()),
        template_token: '',
        title: titleValue,
      }),
    });
    return { status: response.status, text: await response.text() };
  }, { spaceIdValue: spaceId, parentTokenValue: parentToken, titleValue: title, csrfToken: csrf });
  if (result.status >= 300) throw new Error(`Cannot create ${title}: ${result.status} ${result.text}`);
}

async function ensurePage(page, csrf, spec) {
  let treeData = await fetchTree(page, spec.parentToken);
  const titles = new Set([spec.title, ...(spec.previousTitles || [])]);
  let node = childNodes(treeData, spec.parentToken).find((child) => titles.has(child.title));

  if (!node) {
    await createNode(page, csrf, spec.parentToken, spec.title);
    await page.waitForTimeout(1200);
    treeData = await fetchTree(page, spec.parentToken);
    node = childNodes(treeData, spec.parentToken).find((child) => child.title === spec.title);
    if (!node) throw new Error(`Created page is missing from tree: ${spec.title}`);
    return { node, created: true, renamed: false };
  }

  if (node.title !== spec.title) {
    await renameNode(page, csrf, node.wiki_token, spec.title);
    await page.waitForTimeout(1200);
    treeData = await fetchTree(page, spec.parentToken);
    node = childNodes(treeData, spec.parentToken).find((child) => child.wiki_token === node.wiki_token);
    if (!node || node.title !== spec.title) throw new Error(`Renamed page is missing from tree: ${spec.title}`);
    return { node, created: false, renamed: true };
  }

  return { node, created: false, renamed: false };
}

async function setClipboard(page, plain, html) {
  await page.evaluate(async ({ plainText, htmlText }) => {
    const item = new ClipboardItem({
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
      'text/html': new Blob([htmlText], { type: 'text/html' }),
    });
    await navigator.clipboard.write([item]);
  }, { plainText: plain, htmlText: html });
}

async function moveToEnd(page) {
  const editors = page.locator('.zone-container.text-editor');
  const count = await editors.count();
  if (!count) throw new Error('Cannot locate a writable document body.');

  const placeholder = page.getByText('输入“/”快速插入内容', { exact: false }).last();
  if (count === 1 && await placeholder.count() && await placeholder.isVisible()) {
    const box = await placeholder.boundingBox();
    await page.mouse.click(box.x + 16, box.y + box.height / 2);
    return;
  }

  const last = editors.last();
  const box = await last.boundingBox();
  await last.click({ position: { x: Math.max(10, box.width - 5), y: Math.max(8, box.height - 5) } });
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
}

async function appendRich(page, plain, html) {
  await moveToEnd(page);
  await setClipboard(page, plain, html);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(2200);
}

async function ensureEditable(page) {
  const editButton = page.getByRole('button', { name: '编辑' }).last();
  if (await editButton.count()) {
    await editButton.click();
    await page.waitForTimeout(2500);
  }
}

async function deleteProbeLines(page) {
  let deleted = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const editors = page.locator('.zone-container.text-editor');
    let target = null;
    for (let index = (await editors.count()) - 1; index >= 0; index -= 1) {
      const candidate = editors.nth(index);
      if (clean(await candidate.innerText()) === '/') {
        target = candidate;
        break;
      }
    }
    if (!target) break;
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) break;
    await page.mouse.move(box.x - 30, box.y + box.height / 2);
    await page.waitForTimeout(250);
    await page.locator('.menu-trigger:visible').last().click({ force: true });
    await page.waitForTimeout(300);
    await page.locator('.menu-text:visible').filter({ hasText: '删除' }).last().click();
    await page.waitForTimeout(500);
    deleted += 1;
  }
  return deleted;
}

function normalizeFileLabel(text) {
  return clean(text).replaceAll(/\s+/g, '').replace(/\d+\.\d+MB$/, '');
}

async function readAttachmentLabels(page) {
  const originalTop = await page.evaluate(() => document.querySelector('.bear-web-x-container')?.scrollTop || 0);
  const labels = new Set();

  for (let pass = 0; pass < 2; pass += 1) {
    const state = await page.evaluate(() => {
      const container = document.querySelector('.bear-web-x-container');
      return container ? { height: container.scrollHeight, viewport: container.clientHeight } : { height: 0, viewport: 800 };
    });
    const step = Math.max(300, Math.floor(state.viewport * 0.4));
    for (let top = 0; top <= state.height + step; top += step) {
      await page.evaluate((value) => {
        const container = document.querySelector('.bear-web-x-container');
        if (container) container.scrollTop = value;
      }, top);
      await page.waitForTimeout(450);
      const visible = await page.locator('.docx-file-block').evaluateAll((blocks) => blocks.map((block) => (block.innerText || '').replace(/\u200b/g, '').trim()));
      visible.forEach((label) => labels.add(normalizeFileLabel(label)));
    }
  }

  await page.evaluate((value) => {
    const container = document.querySelector('.bear-web-x-container');
    if (container) container.scrollTop = value;
  }, originalTop);
  return labels;
}

function hasAttachment(labels, filePath) {
  const expected = normalizeFileLabel(path.basename(filePath));
  return [...labels].some((label) => label.includes(expected));
}

async function uploadFiles(page, filePaths) {
  await moveToEnd(page);
  await page.keyboard.type('/', { delay: 100 });
  await page.waitForTimeout(1000);
  const menuItem = page.getByText('视频或文件', { exact: true }).last();
  await menuItem.waitFor({ state: 'visible', timeout: 10000 });
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
  await menuItem.click();
  await (await chooserPromise).setFiles(filePaths);
  await page.waitForTimeout(Math.max(9000, Math.min(120000, 4000 + filePaths.length * 3500)));
}

async function publishCoursePage(page, csrf) {
  const ensured = await ensurePage(page, csrf, courseSpec);
  const url = `${origin}/wiki/${ensured.node.wiki_token}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await ensureEditable(page);

  const deletedProbeLines = await deleteProbeLines(page);
  let text = clean(await page.locator('body').innerText());

  if (!text.includes(courseSpec.summaryMarker)) {
    await appendRich(page, courseSpec.summaryPlain, courseSpec.summaryHtml);
    text = clean(await page.locator('body').innerText());
  }

  if (!text.includes(courseSpec.sectionMarker)) {
    await appendRich(
      page,
      `${courseSpec.sectionMarker}\n${courseSpec.sectionDescription}`,
      `<h2>${escapeHtml(courseSpec.sectionMarker)}</h2><p>${escapeHtml(courseSpec.sectionDescription)}</p>`,
    );
    text = clean(await page.locator('body').innerText());
  }

  let labels = await readAttachmentLabels(page);
  const missingBeforeUpload = courseSpec.files.filter((filePath) => !hasAttachment(labels, filePath));
  const uploaded = [];

  if (missingBeforeUpload.length) {
    await uploadFiles(page, missingBeforeUpload);
    uploaded.push(...missingBeforeUpload);
    labels = await readAttachmentLabels(page);
  }

  await page.waitForTimeout(3500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const finalLabels = await readAttachmentLabels(page);
  const missingAfterUpload = courseSpec.files.filter((filePath) => !hasAttachment(finalLabels, filePath));

  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'review-期末复习 - 电子电工.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    type: 'courseReview',
    title: courseSpec.title,
    url,
    created: ensured.created,
    renamed: ensured.renamed,
    deletedProbeLines,
    expectedFiles: courseSpec.files.length,
    uploadedFiles: uploaded.map((filePath) => path.basename(filePath)),
    missingFiles: missingAfterUpload.map((filePath) => path.basename(filePath)),
    screenshotPath,
  };
}

function foodPagePlain() {
  return [
    '资料说明',
    '本页整理自 2026-06-01 至 2026-06-02 的社区共建记录与公开 WPS 协作文档，只保留文字整理和外部链接。',
    '适合查看：刚到下沙、想找外卖/堂食避雷与省钱入口的同学。',
    '使用前请注意：口味强主观、商家状态与配送范围变化快，卫生与少送问题请结合最新评价自行判断。',
    foodSpec.verificationMarker,
    '',
    '核心入口',
    `- 下沙外卖互助表：${foodSpec.wpsUrl}`,
    '- 当前 WPS 公开表内已有这些工作表：请先看、好吃的、好吃的 (2)、好吃的(2)、性价比高、好喝的饮品！、好难吃 (2)、好难吃、好吃的堂食店、外卖省钱省钱、少送餐品、答疑帖。',
    '',
    '群内高频推荐',
    '- 袁记云饺、裕禧拉面、喜仕屋、海底捞拌饭、米村、张正发、尊宝披萨、衢州私房菜、饭其家、小禾山、dz减脂轻食。',
    '- 另外有群友补充推荐：千里香小馄饨、中原大刀、绿茶、杭景元麻辣烫、唐福宇麻辣烫。',
    '',
    '评价分化或中位',
    '- 钱小匠、麻辣烫（张亮、杨国福）、膳当家、老乡鸡、小杨生煎、沙县小吃、公瑾爆蛋盖浇饭、淮南牛肉汤、外卖铜锅鸡、潮汕牛肉饭面总管、蟹有钳肉蟹煲、三米、陈记大碗面。',
    '',
    '明确避雷',
    '- 麦当劳、肯德基、塔可星、塔斯汀，以及“鸡柳大人、正新鸡排”等高频快餐类垃圾食品。',
    '- 稻状元、东北老盒饭、宴子礼山。',
    '',
    '补充提醒',
    '- 米村的酸菜烧肥牛被提到过，但也有群友说现在好像没有了。',
    '- 小禾山整体偏推荐，但粉丝煲有人反馈一般。',
    '- 张亮麻辣烫有人反馈吃完容易拉肚子；这类主观体验只做提醒，不作为定论。',
    '',
    '点单参考（不上传订单截图原图）',
    '- 群内截图里出现过的商家包括：米村拌饭、新发现下沙龙湖店、外婆家·外婆送、汤布里波·炸鸡新贵、绿茶餐厅、朱阿根烧饼、小禾山炒鸡米饭、新白鹿、张正发茶餐厅。',
    '',
    '使用建议',
    '- 先看 WPS 互助表的对应分类，再把本页文字摘录当作快速导航。',
    '- 遇到“少送餐品”或强烈避雷项时，建议先看最新平台评价，再决定是否下单。',
  ].join('\n');
}

function foodPageHtml() {
  const tabs = [
    '请先看',
    '好吃的',
    '好吃的 (2)',
    '好吃的(2)',
    '性价比高',
    '好喝的饮品！',
    '好难吃 (2)',
    '好难吃',
    '好吃的堂食店',
    '外卖省钱省钱',
    '少送餐品',
    '答疑帖',
  ];
  const tabItems = tabs.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return [
    '<h1>资料说明</h1>',
    '<p>本页整理自 2026-06-01 至 2026-06-02 的社区共建记录与公开 WPS 协作文档，只保留文字整理和外部链接。</p>',
    '<blockquote><strong>适合查看：</strong>刚到下沙、想找外卖/堂食避雷与省钱入口的同学。</blockquote>',
    '<blockquote><strong>使用前请注意：</strong>口味强主观、商家状态与配送范围变化快，卫生与少送问题请结合最新评价自行判断。</blockquote>',
    `<p><strong>整理记录：</strong>${escapeHtml(foodSpec.verificationMarker)}</p>`,
    '<h2>核心入口</h2>',
    `<p><a href="${foodSpec.wpsUrl}">下沙外卖互助表！</a></p>`,
    '<p>当前公开 WPS 表内已包含以下工作表，可按分类查看：</p>',
    `<ul>${tabItems}</ul>`,
    '<h2>群内高频推荐</h2>',
    '<ul><li>袁记云饺、裕禧拉面、喜仕屋、海底捞拌饭、米村、张正发、尊宝披萨、衢州私房菜、饭其家、小禾山、dz减脂轻食。</li><li>另外有群友补充推荐：千里香小馄饨、中原大刀、绿茶、杭景元麻辣烫、唐福宇麻辣烫。</li></ul>',
    '<h2>评价分化或中位</h2>',
    '<ul><li>钱小匠、麻辣烫（张亮、杨国福）、膳当家、老乡鸡、小杨生煎、沙县小吃、公瑾爆蛋盖浇饭、淮南牛肉汤、外卖铜锅鸡、潮汕牛肉饭面总管、蟹有钳肉蟹煲、三米、陈记大碗面。</li></ul>',
    '<h2>明确避雷</h2>',
    '<ul><li>麦当劳、肯德基、塔可星、塔斯汀，以及“鸡柳大人、正新鸡排”等高频快餐类垃圾食品。</li><li>稻状元、东北老盒饭、宴子礼山。</li></ul>',
    '<h2>补充提醒</h2>',
    '<ul><li>米村的酸菜烧肥牛被提到过，但也有群友说现在好像没有了。</li><li>小禾山整体偏推荐，但粉丝煲有人反馈一般。</li><li>张亮麻辣烫有人反馈吃完容易拉肚子；这类主观体验只做提醒，不作为定论。</li></ul>',
    '<h2>点单参考（不上传订单截图原图）</h2>',
    '<ul><li>群内截图里出现过的商家包括：米村拌饭、新发现下沙龙湖店、外婆家·外婆送、汤布里波·炸鸡新贵、绿茶餐厅、朱阿根烧饼、小禾山炒鸡米饭、新白鹿、张正发茶餐厅。</li></ul>',
    '<h2>使用建议</h2>',
    '<ul><li>先看 WPS 互助表的对应分类，再把本页文字摘录当作快速导航。</li><li>遇到“少送餐品”或强烈避雷项时，建议先看最新平台评价，再决定是否下单。</li></ul>',
  ].join('');
}

async function publishFoodPage(page, csrf) {
  const ensured = await ensurePage(page, csrf, foodSpec);
  const url = `${origin}/wiki/${ensured.node.wiki_token}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await ensureEditable(page);

  const deletedProbeLines = await deleteProbeLines(page);
  const text = clean(await page.locator('body').innerText());
  if (!text.includes(foodSpec.verificationMarker)) {
    await appendRich(page, foodPagePlain(), foodPageHtml());
  }

  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const verification = await page.evaluate(() => {
    const normalize = (value) => (value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
    const body = normalize(document.body.innerText);
    const links = [...document.querySelectorAll('a')]
      .map((element) => ({ text: normalize(element.innerText), href: element.href }))
      .filter((item) => item.text || item.href);
    return { body, links };
  });

  const hasWpsLink = verification.links.some((item) => item.href.startsWith(foodSpec.wpsUrl));
  if (!verification.body.includes(foodSpec.verificationMarker) || !hasWpsLink) {
    throw new Error(`Food page verification failed: marker=${verification.body.includes(foodSpec.verificationMarker)} link=${hasWpsLink}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'review-美食红黑榜 - 下沙外卖互助.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    type: 'campusLife',
    title: foodSpec.title,
    url,
    created: ensured.created,
    renamed: ensured.renamed,
    deletedProbeLines,
    wpsUrl: foodSpec.wpsUrl,
    screenshotPath,
  };
}

if (onlyPage !== 'food') {
  for (const filePath of courseSpec.files) {
    if (!fs.existsSync(filePath)) throw new Error(`Missing source file: ${filePath}`);
  }
}

fs.mkdirSync(reportDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 900 },
  args: ['--start-maximized'],
});

await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = context.pages()[0] ?? await context.newPage();
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const csrf = (await context.cookies()).find((cookie) => cookie.name === '_csrf_token')?.value;
if (!csrf) throw new Error('Missing Feishu CSRF token; please confirm the saved browser profile is signed in.');

const results = [];
if (onlyPage !== 'food') results.push(await publishCoursePage(page, csrf));
if (onlyPage !== 'course') results.push(await publishFoodPage(page, csrf));

const report = {
  publishedAt: publishDate,
  pageCount: results.length,
  expectedFileCount: courseSpec.files.length,
  uploadedFileCount: results.find((item) => item.type === 'courseReview')?.uploadedFiles.length ?? 0,
  missingFileCount: results.find((item) => item.type === 'courseReview')?.missingFiles.length ?? 0,
  pages: results,
};

const reportPath = path.join(reportDir, 'feishu-upload-report-community-update-2026-06-02.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));

await context.close();
