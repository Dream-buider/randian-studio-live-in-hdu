import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(root, '.pw-edge-profile');
const materialRoot = path.join(root, '期末复习资料');
const mathDir = path.join(materialRoot, '数学');
const englishDir = path.join(materialRoot, '英语');
const physicsDir = path.join(materialRoot, '物理');
const physicsCompiledDir = path.join(root, 'docs', '期末复习发布_2026-05-27', '大学物理汇编');
const origin = 'https://scnbcye3xdfz.feishu.cn';
const originUrl = `${origin}/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc`;
const spaceId = '7639362813286190049';
const parent = 'EdTqwwPDwiuNuwkJjUecYCB5ncf'; // 学业与课程 / 课程复习
const pageFilter = process.env.PAGE_FILTER || '';
const publishDate = '2026-05-28';

function listFiles(dir, regex) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && regex.test(entry.name))
    .map((entry) => path.join(dir, entry.name));
}

function dedupePaths(paths) {
  const hashes = new Map();
  const kept = [];
  const excluded = [];
  for (const filePath of paths.sort((left, right) => path.basename(left).localeCompare(path.basename(right), 'zh-CN'))) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    if (hashes.has(hash)) {
      excluded.push({ filePath, duplicateOf: hashes.get(hash) });
    } else {
      hashes.set(hash, filePath);
      kept.push(filePath);
    }
  }
  return { kept, excluded };
}

function groupFiles(paths, groups) {
  const remaining = new Set(paths);
  const sections = [];
  for (const group of groups) {
    const files = paths.filter((filePath) => remaining.has(filePath) && group.matches(path.basename(filePath)));
    files.forEach((filePath) => remaining.delete(filePath));
    if (files.length) sections.push({ ...group, files });
  }
  if (remaining.size) {
    sections.push({ title: '其他补充资料', description: '未归入以上题型的补充文件。', files: [...remaining] });
  }
  return sections;
}

const highMath = dedupePaths(listFiles(mathDir, /高数|高等数学/));
const linearAlgebra = dedupePaths(listFiles(mathDir, /线代|线性代数/));
const probability = dedupePaths(listFiles(mathDir, /概率|数理统计|概率统计/));
const discrete = dedupePaths(listFiles(mathDir, /离散/));
const physicsRaw = dedupePaths([...listFiles(mathDir, /物理/), ...listFiles(physicsDir, /\.pdf$/i)]);
const englishRaw = dedupePaths([...listFiles(englishDir, /\.(pdf|doc|docx)$/i), ...listFiles(mathDir, /口试|英语/)]);
const physicsCompiled = listFiles(physicsCompiledDir, /^大学物理期末复习题库汇编.*\.pdf$/i);

const pages = [
  {
    title: '期末复习 | 高等数学',
    audience: '复习高等数学 A/B/D 课程或准备期中、期末自测的同学',
    description: '高等数学试题、答案与模拟资料按复习场景集中归档。',
    note: '资料含不同课程类型与回忆版内容，考试范围及标准答案请以当学期任课教师通知为准。',
    sections: groupFiles(highMath.kept, [
      { title: '期末卷与补考卷', description: '历年期末与补考训练材料。', matches: (name) => /期末|补考/.test(name) },
      { title: '期中卷与解析', description: '按课程类型选择对应期中题目练习。', matches: (name) => /期中/.test(name) },
      { title: '模拟与题库', description: '复习模拟、题库或压缩包补充材料。', matches: (name) => /模拟|题库|\.rar$/i.test(name) },
    ]),
    excluded: highMath.excluded,
  },
  {
    title: '期末复习 | 线性代数',
    audience: '复习线性代数课程的同学',
    description: '线性代数历年卷、解析和模拟练习集中入口。',
    note: '部分资料为回忆版或不同版本解析，核对答案时请结合课堂讲解。',
    sections: groupFiles(linearAlgebra.kept, [
      { title: '期末卷与复习题', description: '期末训练与综合复习材料。', matches: (name) => /期末|复习/.test(name) },
      { title: '期中卷与解析', description: '期中试题、解析和勘误资料。', matches: (name) => /期中|勘误/.test(name) },
      { title: '模拟练习', description: '用于查漏补缺的模拟资料。', matches: (name) => /模拟/.test(name) },
    ]),
    excluded: linearAlgebra.excluded,
  },
  {
    title: '期末复习 | 概率论与数理统计',
    audience: '复习概率论或概率统计课程的同学',
    description: '概率论与数理统计历年卷、回忆解析和模拟训练。',
    note: '回忆版与模拟卷用于巩固题型，具体考纲以任课教师要求为准。',
    sections: groupFiles(probability.kept, [
      { title: '期末卷', description: '历年期末试题及可用答案。', matches: (name) => /期末/.test(name) },
      { title: '期中卷与回忆解析', description: '期中训练及配套解析。', matches: (name) => /期中|回忆/.test(name) },
      { title: '模拟练习', description: '补充自测资料。', matches: (name) => /模拟/.test(name) },
    ]),
    excluded: probability.excluded,
  },
  {
    title: '期末复习 | 离散数学',
    audience: '复习离散数学课程的同学',
    description: '离散数学试卷、答案和复习课件统一归档。',
    note: '重复副本已去除；压缩包内课件请下载后查看。',
    sections: groupFiles(discrete.kept, [
      { title: '期末试卷与答案', description: '按年份和卷别整理的期末资料。', matches: (name) => /期末|A卷|B卷/.test(name) },
      { title: '复习课件', description: '课程复习 PPT 压缩包。', matches: (name) => /PPT|复习|\.zip$/i.test(name) },
    ]),
    excluded: discrete.excluded,
  },
  {
    title: '期末复习 | 大学物理',
    audience: '准备大学物理期中、期末复习与刷题的同学',
    description: '物理散图题库已按知识板块整理成可打印 PDF，并附已有卷面材料。',
    note: '题库截图经 OCR 与题号复核归为力学、静电场与电路、磁场与电磁感应三册；不同截取形式中可能包含同题展示，答案准确性请结合课堂资料核对。',
    sections: [
      { title: '题库汇编（按知识点，可打印）', description: '共整合 334 张题库截图：力学、静电场与电路、磁场与电磁感应。', files: physicsCompiled },
      { title: '试卷与模拟卷', description: '原有的大学物理卷面资料。', files: physicsRaw.kept },
    ],
    excluded: physicsRaw.excluded,
  },
  {
    title: '期末复习 | 大学英语',
    audience: '准备英语口试或雅思专项复习的同学',
    description: '口试题库与雅思练习资料集中入口。',
    note: '雅思资料仅作自学练习使用；课程口试范围以当学期教学安排为准。',
    sections: groupFiles(englishRaw.kept, [
      { title: '课程口试', description: '口试题库文件。', matches: (name) => /口试/.test(name) },
      { title: '雅思练习', description: '剑桥雅思与听力词汇资料。', matches: (name) => /雅思/.test(name) },
    ]),
    excluded: englishRaw.excluded,
  },
];

const clean = (text) => (text || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const allFiles = (spec) => spec.sections.flatMap((section) => section.files);

async function fetchTree(page, token) {
  return page.evaluate(async (wikiToken) => {
    const response = await fetch(`/space/api/wiki/v2/tree/get_info/?wiki_token=${wikiToken}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=true`, { credentials: 'include' });
    return response.json();
  }, token);
}

async function ensurePage(page, csrf, spec) {
  let treeData = await fetchTree(page, parent);
  let node = (treeData.data.tree.child_map[parent] || []).map((token) => treeData.data.tree.nodes[token]).find((child) => child?.title === spec.title);
  if (node) return { node, created: false };
  const result = await page.evaluate(async ({ spaceId, parent, title, csrf }) => {
    const response = await fetch('/space/api/wiki/v2/tree/create_node/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrftoken': csrf, 'docs-host-id': parent, 'docs-host-type': 'Wiki', 'doc-platform': 'web', 'x-lsc-terminal': 'web' },
      body: JSON.stringify({ space_id: spaceId, parent_wiki_token: parent, ua_type: 'Web', scene: 'wiki_create', obj_type: 22, node_type: 0, synergy_uuid: String(Date.now()), template_token: '', title }),
    });
    return { status: response.status, text: await response.text() };
  }, { spaceId, parent, title: spec.title, csrf });
  if (result.status >= 300) throw new Error(`Cannot create ${spec.title}: ${result.status} ${result.text}`);
  await page.waitForTimeout(1000);
  treeData = await fetchTree(page, parent);
  node = (treeData.data.tree.child_map[parent] || []).map((token) => treeData.data.tree.nodes[token]).find((child) => child?.title === spec.title);
  if (!node) throw new Error(`Created page is missing from tree: ${spec.title}`);
  return { node, created: true };
}

async function setClipboard(page, plain, html) {
  await page.evaluate(async ({ plain, html }) => navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([plain], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]), { plain, html });
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

async function locateTextBlock(page, anchorText) {
  const visibleAnchor = () => page.evaluate((needle) => {
    const normalize = (value) => (value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
    const element = [...document.querySelectorAll('.zone-container.text-editor')]
      .find((node) => normalize(node.innerText).includes(needle));
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.top < 70 || rect.bottom > window.innerHeight - 40) return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, anchorText);
  const initial = await visibleAnchor();
  if (initial) return initial;
  const state = await page.evaluate(() => {
    const container = document.querySelector('.bear-web-x-container');
    return container ? { height: container.scrollHeight, viewport: container.clientHeight } : { height: 0, viewport: 800 };
  });
  const step = Math.max(360, Math.floor(state.viewport * 0.5));
  for (let top = 0; top <= state.height + step; top += step) {
    await page.evaluate((value) => {
      const container = document.querySelector('.bear-web-x-container');
      if (container) container.scrollTop = value;
    }, top);
    await page.waitForTimeout(250);
    const anchor = await visibleAnchor();
    if (anchor) return anchor;
  }
  throw new Error(`Cannot locate attachment section description: ${anchorText}`);
}

async function uploadFiles(page, filePaths, anchorText) {
  let menuOpened = false;
  for (const offset of [-30, -20, -10, 0]) {
    const box = await locateTextBlock(page, anchorText);
    await page.mouse.move(box.x + offset, box.y + box.height / 2);
    await page.waitForTimeout(350);
    const trigger = page.locator('.menu-trigger:visible').last();
    if (!(await trigger.count())) continue;
    await trigger.evaluate((element) => element.click());
    await page.waitForTimeout(350);
    if (await page.getByText('在下方添加', { exact: true }).last().isVisible().catch(() => false)) {
      menuOpened = true;
      break;
    }
    await page.keyboard.press('Escape');
  }
  if (!menuOpened) throw new Error(`Cannot open attachment insertion menu after section: ${anchorText}`);
  await page.getByText('在下方添加', { exact: true }).last().hover();
  await page.waitForTimeout(500);
  const menuItem = page.getByText('视频或文件', { exact: true }).last();
  await menuItem.waitFor({ state: 'visible', timeout: 10000 });
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
  await menuItem.click();
  await (await chooserPromise).setFiles(filePaths);
  await page.waitForTimeout(Math.max(9000, Math.min(120000, 4000 + filePaths.length * 3500)));
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

async function repairSplitRecord(page) {
  const editors = page.locator('.zone-container.text-editor');
  let removedPrefix = false;
  for (let index = (await editors.count()) - 1; index >= 0; index -= 1) {
    const text = clean(await editors.nth(index).innerText());
    if (text === '整') {
      const target = editors.nth(index);
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      await page.mouse.move(box.x - 30, box.y + box.height / 2);
      await page.waitForTimeout(250);
      await page.locator('.menu-trigger:visible').last().click({ force: true });
      await page.waitForTimeout(300);
      await page.locator('.menu-text:visible').filter({ hasText: '删除' }).last().click();
      await page.waitForTimeout(500);
      removedPrefix = true;
      break;
    }
  }
  if (!removedPrefix) return false;
  const current = page.locator('.zone-container.text-editor');
  for (let index = 0; index < await current.count(); index += 1) {
    const candidate = current.nth(index);
    if (clean(await candidate.innerText()).startsWith('理记录：本页整理于')) {
      await candidate.click({ position: { x: 3, y: 10 } });
      await page.keyboard.press('Home');
      await page.keyboard.insertText('整');
      await page.waitForTimeout(500);
      return true;
    }
  }
  return false;
}

function normalizeFileLabel(text) {
  return clean(text).replaceAll(/\s+/g, '').replace(/\d+\.\d+MB$/, '');
}

async function readAttachmentLabels(page) {
  const originalTop = await page.evaluate(() => document.querySelector('.bear-web-x-container')?.scrollTop || 0);
  const labels = new Set();
  for (let pass = 0; pass < 3; pass += 1) {
    const state = await page.evaluate(() => {
      const container = document.querySelector('.bear-web-x-container');
      return container ? { height: container.scrollHeight, viewport: container.clientHeight } : { height: 0, viewport: 800 };
    });
    const step = Math.max(300, Math.floor(state.viewport * 0.4));
    for (let top = 0; top <= state.height + step; top += step) {
      await page.evaluate((value) => { const container = document.querySelector('.bear-web-x-container'); if (container) container.scrollTop = value; }, top);
      await page.waitForTimeout(450);
      const visible = await page.locator('.docx-file-block').evaluateAll((blocks) => blocks.map((block) => (block.innerText || '').replace(/\u200b/g, '').trim()));
      visible.forEach((label) => labels.add(normalizeFileLabel(label)));
    }
  }
  await page.evaluate((value) => { const container = document.querySelector('.bear-web-x-container'); if (container) container.scrollTop = value; }, originalTop);
  return labels;
}

function hasAttachment(labels, filePath) {
  const expected = normalizeFileLabel(path.basename(filePath));
  return [...labels].some((label) => label.includes(expected));
}

async function publishPage(page, csrf, spec) {
  const ensured = await ensurePage(page, csrf, spec);
  const url = `${origin}/wiki/${ensured.node.wiki_token}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const deletedProbeLines = await deleteProbeLines(page);
  const repairedRecord = await repairSplitRecord(page);
  let text = clean(await page.locator('body').innerText());
  if (!text.includes(`本页整理于 ${publishDate}`)) {
    await appendRich(page, `资料说明\n${spec.description}\n适合查看：${spec.audience}\n使用前请注意：${spec.note}\n整理记录：本页整理于 ${publishDate}，重复文件已排除。`, `<h1>资料说明</h1><p>${escapeHtml(spec.description)}</p><blockquote><strong>适合查看：</strong>${escapeHtml(spec.audience)}</blockquote><blockquote><strong>使用前请注意：</strong>${escapeHtml(spec.note)}</blockquote><p><strong>整理记录：</strong>本页整理于 ${publishDate}，重复文件已排除。</p>`);
    text = clean(await page.locator('body').innerText());
  }
  for (const section of spec.sections) {
    const sectionMarker = `附件分组：${section.title}`;
    if (!text.includes(sectionMarker)) {
      await appendRich(page, `${sectionMarker}\n${section.description}`, `<h2>${escapeHtml(sectionMarker)}</h2><p>${escapeHtml(section.description)}</p>`);
      text = clean(await page.locator('body').innerText());
    }
  }
  const uploaded = [];
  let labels = await readAttachmentLabels(page);
  for (const section of spec.sections) {
    const missing = section.files.filter((filePath) => !hasAttachment(labels, filePath));
    if (!missing.length) continue;
    const batches = [];
    for (let start = 0; start < missing.length; start += 10) {
      batches.push(missing.slice(start, start + 10));
    }
    for (const batch of batches.reverse()) {
      await uploadFiles(page, batch, section.description);
      uploaded.push(...batch);
    }
    labels = await readAttachmentLabels(page);
    text = clean(await page.locator('body').innerText());
  }
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const finalLabels = await readAttachmentLabels(page);
  const missing = allFiles(spec).filter((filePath) => !hasAttachment(finalLabels, filePath));
  await page.screenshot({ path: path.join(root, `review-${spec.title.replaceAll(/[<>:"/\\|?*]/g, '-')}.png`), fullPage: true });
  return { title: spec.title, url, created: ensured.created, deletedProbeLines, repairedRecord, expected: allFiles(spec).length, uploaded: uploaded.map((filePath) => path.basename(filePath)), missing: missing.map((filePath) => path.basename(filePath)), excludedDuplicates: spec.excluded.map(({ filePath, duplicateOf }) => `${path.basename(filePath)} => ${path.basename(duplicateOf)}`) };
}

const specs = pageFilter ? pages.filter((spec) => spec.title.includes(pageFilter)) : pages;
if (!specs.length) throw new Error(`No page matched PAGE_FILTER=${pageFilter}`);
for (const spec of specs) for (const filePath of allFiles(spec)) if (!fs.existsSync(filePath)) throw new Error(`Missing source file: ${filePath}`);
if (process.env.DRY_RUN === '1') {
  console.log(JSON.stringify(specs.map((spec) => ({ title: spec.title, files: allFiles(spec).map((filePath) => path.basename(filePath)), excludedDuplicates: spec.excluded.map(({ filePath, duplicateOf }) => `${path.basename(filePath)} => ${path.basename(duplicateOf)}`) })), null, 2));
  process.exit(0);
}

const context = await chromium.launchPersistentContext(userDataDir, { executablePath: edgePath, headless: false, viewport: { width: 1456, height: 900 }, args: ['--start-maximized'] });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = context.pages()[0] ?? await context.newPage();
await page.goto(originUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const csrf = (await context.cookies()).find((cookie) => cookie.name === '_csrf_token')?.value;
if (!csrf) throw new Error('Missing Feishu CSRF token; the saved browser profile may need sign-in.');
const results = [];
for (const spec of specs) {
  console.log(`Publishing ${spec.title}: ${allFiles(spec).length} files`);
  results.push(await publishPage(page, csrf, spec));
}
const report = { publishedAt: publishDate, pageCount: results.length, expectedFiles: results.reduce((sum, result) => sum + result.expected, 0), uploadedFiles: results.reduce((sum, result) => sum + result.uploaded.length, 0), missingFiles: results.flatMap((result) => result.missing).length, results };
const reportPath = path.join(root, 'docs', '期末复习发布_2026-05-27', `feishu-upload-report-${pageFilter || 'all'}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
await context.close();
