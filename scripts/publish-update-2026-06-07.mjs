import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(root, '.pw-edge-profile');
const sourceDir = path.join(root, '本次更新');
const outputDir = path.join(root, 'output', 'playwright');
const reportDir = path.join(root, 'docs', '社区更新_2026-06-07');
const origin = 'https://scnbcye3xdfz.feishu.cn';
const originUrl = `${origin}/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc`;
const publishDate = '2026-06-07';
const spaceId = '7639362813286190049';

const parents = {
  courseReview: 'EdTqwwPDwiuNuwkJjUecYCB5ncf',
  program: 'B06rwVMwsivYbNkunJxcRYoInCb',
  examWeek: 'HvrpwMe10itRe0kEEghcCOxDn6d',
  internship: 'KhQBwxXcQiqDKlkoKMycpGnknfc',
};

const changelogPage = {
  title: '更新日志',
  url: `${origin}/wiki/T8RcwgsUQi4JKUkTU2tcnCyYnBh`,
};

const standaloneSkips = [
  {
    filename: '杭州电子科技大学本科学生劳动教育课程管理办法（杭电教〔2023〕151号）(1).pdf',
    reason: '库内已有 `劳动教育课程管理办法` 专页，本次不重复上传同主题政策文件。',
  },
];

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function dedupeFilenames(filenames) {
  const seen = new Map();
  const kept = [];
  const excluded = [];
  for (const filename of filenames) {
    const filePath = path.join(sourceDir, filename);
    const digest = hashFile(filePath);
    if (seen.has(digest)) {
      excluded.push({ filename, duplicateOf: seen.get(digest) });
      continue;
    }
    seen.set(digest, filename);
    kept.push(filename);
  }
  return { kept, excluded };
}

const cppKnownYears = dedupeFilenames([
  '2006 C++试卷A.pdf',
  '2008 C++ 试卷A.pdf',
  '2008 C++ 试卷B.pdf',
  '2009 C++ 试卷A.pdf',
  '2009 C++ 试卷B.pdf',
  '2016 C++ 试卷B (1).pdf',
  '2016 C++ 试卷B (2).pdf',
]);

const pageSpecs = [
  {
    parentToken: parents.program,
    title: 'C++ 程序设计复习资料',
    audience: '正在复习 C++ 程序设计、准备刷题或临近期末总复习的同学',
    description: '把 C++ 已知年份试卷、年份待核试卷、复习提示和总复习课件整理到同一入口，方便连续刷题。',
    note: '试卷、提示和总复习材料仅作课程复习参考；考试范围、题型变化和评分要求请以任课教师当学期通知为准。',
    sections: [
      {
        title: '历年试卷（已知年份）',
        description: '按年份归档的 A/B 卷，适合按时间顺序刷题。',
        files: cppKnownYears.kept,
      },
      {
        title: '历年试卷（年份待核）',
        description: '暂未确认具体年份的补充卷面，可作为额外练习题库。',
        files: [
          '未知年份C++试卷A.pdf',
          '未知年份C++试卷A2.pdf',
          '未知年份C++试卷B.pdf',
          '未知年份C++试卷B2.pdf',
          '未知年份C++试卷B3.pdf',
        ],
      },
      {
        title: '复习提示与总复习',
        description: '包含复习提示 PDF 与章节总复习课件，适合考前快速过一遍重点。',
        files: [
          '复习提示c++ (1).pdf',
          'chap14总复习(1).pptx',
        ],
      },
    ],
    excludedDuplicates: cppKnownYears.excluded,
  },
  {
    parentToken: parents.courseReview,
    title: '期末复习 | 思想道德与法治',
    audience: '正在准备思政课期末复习的同学',
    description: '归档本学期《思想道德与法治》复习大纲，方便在课程复习入口直接查看。',
    note: '复习大纲仅作课程复习参考；考试范围、重点和最终要求请以任课教师与学院通知为准。',
    sections: [
      {
        title: '复习大纲',
        description: '建议结合课堂笔记和老师强调内容一起看。',
        files: ['2025-2026-2《思想道德与法治》复习大纲(1).docx'],
      },
    ],
    excludedDuplicates: [],
  },
  {
    parentToken: parents.examWeek,
    title: '2025-2026-2 期末考试安排查询',
    audience: '需要查询本学期期末考试安排的同学',
    description: '归档本学期考试安排查询通知，便于在考试周入口直接查看查询方式与时间说明。',
    note: '考试时间、地点和查询开放时间都可能调整，请以教务系统和学校正式通知为准。',
    sections: [
      {
        title: '考试安排通知',
        description: '先看查询开放说明，再到教务系统核对个人安排。',
        files: ['关于开放2025-2026-2期末考试安排信息查询的通知.pdf'],
      },
    ],
    excludedDuplicates: [],
  },
  {
    parentToken: parents.internship,
    title: '机器人与具身智能岗位资料',
    audience: '想了解机器人、SLAM、嵌入式、感知和具身智能方向岗位的同学',
    description: '集中归档机器人与具身智能相关岗位资料，方便在实习入口快速了解方向与面试准备内容。',
    note: '岗位资料与面试题仅作方向了解和自学参考，不代表具体公司、团队或当期招聘要求。',
    sections: [
      {
        title: '岗位方向资料',
        description: '覆盖导航、感知、运动控制、嵌入式、硬件和具身智能等常见方向。',
        files: [
          '导航算法工程师.pdf',
          '工业机器人算法工程师.pdf',
          '机器人感知算法工程师.pdf',
          '机器人嵌入式软件开发工程师.pdf',
          '机器人硬件工程师.pdf',
          '机器人运动控制算法工程师.pdf',
          '具身智能算法工程师.pdf',
        ],
      },
      {
        title: '面试题补充',
        description: '适合作为 SLAM 方向面试前的补充练习材料。',
        files: ['机器人SLAM算法工程师面试题.pdf'],
      },
    ],
    excludedDuplicates: [],
  },
];

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

function allFiles(spec) {
  return spec.sections.flatMap((section) => section.files);
}

async function fetchTree(page, token) {
  return page.evaluate(async (wikiToken) => {
    const response = await fetch(`/space/api/wiki/v2/tree/get_info/?wiki_token=${wikiToken}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=true`, { credentials: 'include' });
    return response.json();
  }, token);
}

async function ensurePage(page, csrf, parentToken, title) {
  let treeData = await fetchTree(page, parentToken);
  let node = (treeData.data.tree.child_map[parentToken] || [])
    .map((token) => treeData.data.tree.nodes[token])
    .find((child) => child?.title === title);
  if (node) return { node, created: false };

  const result = await page.evaluate(async ({ spaceIdValue, parentTokenValue, titleValue, csrfValue }) => {
    const response = await fetch('/space/api/wiki/v2/tree/create_node/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrftoken': csrfValue,
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
  }, { spaceIdValue: spaceId, parentTokenValue: parentToken, titleValue: title, csrfValue: csrf });
  if (result.status >= 300) {
    throw new Error(`Cannot create page ${title}: ${result.status} ${result.text}`);
  }

  await page.waitForTimeout(800);
  treeData = await fetchTree(page, parentToken);
  node = (treeData.data.tree.child_map[parentToken] || [])
    .map((token) => treeData.data.tree.nodes[token])
    .find((child) => child?.title === title);
  if (!node) throw new Error(`Created page is missing from tree: ${title}`);
  return { node, created: true };
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

async function moveToEnd(page, { append = true } = {}) {
  const editors = page.locator('.zone-container.text-editor');
  const count = await editors.count();
  if (count < 1) throw new Error('Cannot locate a writable document body.');
  const placeholder = page.getByText('输入“/”快速插入内容', { exact: false }).last();
  if (count === 1 && await placeholder.count() && await placeholder.isVisible()) {
    const box = await placeholder.boundingBox();
    if (!box) throw new Error('Cannot locate the empty document body placeholder.');
    await page.mouse.click(box.x + 16, box.y + box.height / 2);
    await page.waitForTimeout(400);
    return;
  }
  await editors.last().click({ position: { x: 32, y: 12 } });
  await page.keyboard.press('Control+End');
  if (append) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
  }
}

async function appendRich(page, plain, html) {
  await moveToEnd(page);
  await setClipboard(page, plain, html);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(2200);
}

async function readBodyText(page) {
  return clean(await page.locator('body').innerText());
}

function normalizeFileLabel(text) {
  return clean(text).replaceAll(/\s+/g, '').replace(/\d+\.\d+MB$/, '');
}

async function readAttachmentLabels(page) {
  const scrollState = await page.evaluate(() => {
    const container = document.querySelector('.bear-web-x-container');
    return container
      ? { top: container.scrollTop, height: container.scrollHeight, viewport: container.clientHeight }
      : { top: 0, height: 0, viewport: 800 };
  });
  const labels = new Set();
  const step = Math.max(420, Math.floor(scrollState.viewport * 0.65));
  for (let top = 0; top <= scrollState.height + step; top += step) {
    await page.evaluate((value) => {
      const container = document.querySelector('.bear-web-x-container');
      if (container) container.scrollTop = value;
    }, top);
    await page.waitForTimeout(220);
    const visible = await page.locator('.docx-file-block').evaluateAll((blocks) => (
      blocks.map((block) => (block.innerText || '').replace(/\u200b/g, '').trim())
    ));
    for (const label of visible) labels.add(normalizeFileLabel(label));
  }
  await page.evaluate((value) => {
    const container = document.querySelector('.bear-web-x-container');
    if (container) container.scrollTop = value;
  }, scrollState.top);
  return labels;
}

function includesAttachment(labels, filename) {
  const expected = normalizeFileLabel(filename);
  return [...labels].some((label) => label.includes(expected));
}

async function uploadFiles(page, filenames) {
  const filePaths = filenames.map((filename) => path.join(sourceDir, filename));
  await moveToEnd(page);
  await page.keyboard.type('/', { delay: 100 });
  await page.waitForTimeout(1000);
  const menuItem = page.getByText('视频或文件', { exact: true }).last();
  await menuItem.waitFor({ state: 'visible', timeout: 10000 });
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
  await menuItem.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePaths);
  const waitMs = Math.max(8000, Math.min(120000, 4000 + filenames.length * 3500));
  await page.waitForTimeout(waitMs);
}

async function publishPage(page, csrf, spec) {
  const ensured = await ensurePage(page, csrf, spec.parentToken, spec.title);
  const url = `${origin}/wiki/${ensured.node.wiki_token}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await enterEditMode(page);

  let text = await readBodyText(page);
  const headerMarker = `本页收录于 ${publishDate}`;
  if (!text.includes(headerMarker)) {
    const plain = `资料说明\n${spec.description}\n\n适合查看：${spec.audience}\n\n使用前请注意：${spec.note}\n\n整理记录：本页收录于 ${publishDate}，由本次社区补充任务整理发布。`;
    const html = `
      <h1>资料说明</h1>
      <p>${escapeHtml(spec.description)}</p>
      <blockquote><strong>适合查看：</strong>${escapeHtml(spec.audience)}</blockquote>
      <blockquote><strong>使用前请注意：</strong>${escapeHtml(spec.note)}</blockquote>
      <p><strong>整理记录：</strong>本页收录于 ${publishDate}，由本次社区补充任务整理发布。</p>`;
    await appendRich(page, plain, html);
    text = await readBodyText(page);
  }

  const uploaded = [];
  let attachmentLabels = await readAttachmentLabels(page);
  for (const section of spec.sections) {
    const missing = section.files.filter((filename) => !includesAttachment(attachmentLabels, filename));
    if (!text.includes(section.title)) {
      const plain = `${section.title}\n${section.description}`;
      const html = `<h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.description)}</p>`;
      await appendRich(page, plain, html);
      text = await readBodyText(page);
    }

    if (!missing.length) continue;
    for (let start = 0; start < missing.length; start += 10) {
      const batch = missing.slice(start, start + 10);
      await uploadFiles(page, batch);
      uploaded.push(...batch);
    }
    attachmentLabels = await readAttachmentLabels(page);
  }

  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const finalText = await readBodyText(page);
  const finalAttachmentLabels = await readAttachmentLabels(page);
  const missingAfterUpload = allFiles(spec).filter((filename) => !includesAttachment(finalAttachmentLabels, filename));

  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, `review-${spec.title.replaceAll(/[<>:"/\\|?*]/g, '-')}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    title: spec.title,
    url,
    token: ensured.node.wiki_token,
    created: ensured.created,
    expectedFiles: allFiles(spec),
    uploaded,
    missingAfterUpload,
    excludedDuplicates: spec.excludedDuplicates,
    containsHeader: finalText.includes(headerMarker),
    screenshotPath,
  };
}

const changelogChunks = [
  {
    plain: `更新日志
这里记录 LIVE IN HDU 的主要资料发布与结构调整，按日期保留简明记录。

2026-06-07
1. 程序设计资料补充
- 新增 C++ 程序设计复习资料页，集中整理历年卷、待核年份试卷、复习提示和总复习课件。
- C++ 资料中去除 1 个完全重复副本，仅保留一份 2016 C++ 试卷B。

2. 课程与考试资料补充
- 新增 期末复习 | 思想道德与法治。
- 新增 2025-2026-2 期末考试安排查询。

3. 就业方向资料补充
- 新增 机器人与具身智能岗位资料，归档岗位方向资料与 SLAM 面试题。

4. 本次边界
- 不改首页 AI 问答助手链接。
- 劳动教育课程管理办法因库内已有同主题页面，本次不重复上传。`,
    html: `
<h1>更新日志</h1>
<p>这里记录 LIVE IN HDU 的主要资料发布与结构调整，按日期保留简明记录。</p>
<h2>2026-06-07</h2>
<p><strong>1. 程序设计资料补充</strong><br />- 新增 C++ 程序设计复习资料页，集中整理历年卷、待核年份试卷、复习提示和总复习课件。<br />- C++ 资料中去除 1 个完全重复副本，仅保留一份 2016 C++ 试卷B。</p>
<p><strong>2. 课程与考试资料补充</strong><br />- 新增 <code>期末复习 | 思想道德与法治</code>。<br />- 新增 <code>2025-2026-2 期末考试安排查询</code>。</p>
<p><strong>3. 就业方向资料补充</strong><br />- 新增 <code>机器人与具身智能岗位资料</code>，归档岗位方向资料与 SLAM 面试题。</p>
<p><strong>4. 本次边界</strong><br />- 不改首页 AI 问答助手链接。<br />- 劳动教育课程管理办法因库内已有同主题页面，本次不重复上传。</p>`,
  },
  {
    plain: `2026-06-02
1. 电子电工复习页补充
- 更新期末复习 | 电子电工，补充电子技术基础习题及实验指导、授课计划 2 份资料。

2. 校园生活资料补充
- 新增 美食红黑榜 | 下沙外卖互助，整理 WPS 互助表入口、推荐与避雷摘录。

2026-05-31
1. 第二批资料发布
- 发布 31 份补充资料，补齐毕业与学位、党团与实践、奖助与评优等入口。
- 首页改为公告栏式首屏，并补写更新日志页。`,
    html: `
<h2>2026-06-02</h2>
<p><strong>1. 电子电工复习页补充</strong><br />- 更新 <code>期末复习 | 电子电工</code>，补充电子技术基础习题及实验指导、授课计划 2 份资料。</p>
<p><strong>2. 校园生活资料补充</strong><br />- 新增 <code>美食红黑榜 | 下沙外卖互助</code>，整理 WPS 互助表入口、推荐与避雷摘录。</p>
<h2>2026-05-31</h2>
<p><strong>1. 第二批资料发布</strong><br />- 发布 31 份补充资料，补齐毕业与学位、党团与实践、奖助与评优等入口。<br />- 首页改为公告栏式首屏，并补写更新日志页。</p>`,
  },
  {
    plain: `2026-05-28
1. 期末复习专区上线
- 在课程复习下新增高数、线代、概率论与数理统计、离散数学、大学物理、大学英语 6 个入口。
- 发布 106 份有效附件，并将大学物理题库整理为 3 册 PDF。

2026-05-24
1. 首页门户化
- 补充快速导航、问答入口和新生指北。

2026-05-18
1. 知识库结构重构
- 完成 LIVE IN HDU V1 信息架构重构。`,
    html: `
<h2>2026-05-28</h2>
<p><strong>1. 期末复习专区上线</strong><br />- 在课程复习下新增高数、线代、概率论与数理统计、离散数学、大学物理、大学英语 6 个入口。<br />- 发布 106 份有效附件，并将大学物理题库整理为 3 册 PDF。</p>
<h2>2026-05-24</h2>
<p><strong>1. 首页门户化</strong><br />- 补充快速导航、问答入口和新生指北。</p>
<h2>2026-05-18</h2>
<p><strong>1. 知识库结构重构</strong><br />- 完成 LIVE IN HDU V1 信息架构重构。</p>`,
  },
];

async function replaceBody(page, chunks) {
  const editors = page.locator('.zone-container.text-editor');
  const count = await editors.count();
  if (count < 1) throw new Error(`Cannot find body editor. Found ${count} text editors.`);

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

async function updateChangelog(page) {
  await page.goto(changelogPage.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await enterEditMode(page);
  await replaceBody(page, changelogChunks);
  await page.waitForTimeout(12000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const summary = await page.evaluate(() => {
    const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
    return {
      bodyText: normalize(document.body.innerText),
      headings: [...document.querySelectorAll('h1,h2,h3')].map((el) => normalize(el.innerText)).filter(Boolean),
    };
  });

  for (const marker of ['2026-06-07', '程序设计资料补充', '不改首页 AI 问答助手链接']) {
    if (!summary.bodyText.includes(marker)) {
      throw new Error(`Verification failed for 更新日志: missing "${marker}"`);
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'home-changelog-page-2026-06-07.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    title: changelogPage.title,
    url: changelogPage.url,
    headings: summary.headings.slice(0, 20),
    screenshotPath,
  };
}

for (const spec of pageSpecs) {
  for (const filename of allFiles(spec)) {
    const fullPath = path.join(sourceDir, filename);
    if (!fs.existsSync(fullPath)) throw new Error(`Source file does not exist: ${fullPath}`);
  }
}

for (const item of standaloneSkips) {
  const fullPath = path.join(sourceDir, item.filename);
  if (!fs.existsSync(fullPath)) throw new Error(`Skipped file missing unexpectedly: ${fullPath}`);
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

const pageResults = [];
for (const spec of pageSpecs) {
  pageResults.push(await publishPage(page, csrf, spec));
}
const changelogResult = await updateChangelog(page);

const report = {
  publishedAt: publishDate,
  pageCount: pageResults.length,
  expectedFileCount: pageSpecs.flatMap(allFiles).length,
  uploadedFileCount: pageResults.flatMap((item) => item.uploaded).length,
  missingFileCount: pageResults.flatMap((item) => item.missingAfterUpload).length,
  skippedStandalone: standaloneSkips,
  pageResults,
  changelogResult,
};

const reportPath = path.join(reportDir, 'feishu-upload-report-update-2026-06-07.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));

await context.close();
