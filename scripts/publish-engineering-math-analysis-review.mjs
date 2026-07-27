import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(root, '.pw-edge-profile');
const sourceRoot = path.join(root, '工科数学分析 (1)', '飞书上传版');
const teacherDir = path.join(sourceRoot, '01_老师要求与课本定位');
const imageDir = path.join(sourceRoot, '02_图片习题分类PDF');
const practiceDir = path.join(sourceRoot, '03_单元自测题与补充资料');
const supplementDir = path.join(practiceDir, '补充习题1-6');
const outputDir = path.join(root, 'output', 'playwright');
const reportDir = path.join(root, 'docs', '工科数学分析复习发布_2026-05-31');
const origin = 'https://scnbcye3xdfz.feishu.cn';
const originUrl = `${origin}/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc`;
const spaceId = '7639362813286190049';
const parent = 'EdTqwwPDwiuNuwkJjUecYCB5ncf'; // 学业与课程 / 课程复习
const publishDate = '2026-05-31';

const pageSpec = {
  title: '期末复习 | 工科数学分析',
  audience: '正在复习工科数学分析、需要按老师要求刷题与定位课本章节的同学',
  description: '把老师要求截图、分散题图、章节自测题和补充习题整理成可直接浏览与下载的复习包。',
  note: '本页优先上传整理后的 PDF 与习题资料；源文件中的整本电子教材 PDF 与原始 PNG 暂不公开上传，以避免页面过重和额外传播风险。考试范围、答案与最终要求请以任课教师通知为准。',
  sections: [
    {
      title: '老师要求与课本定位',
      description: '先看老师布置的题号，再用教材定位版快速对应到电子课本章节。',
      files: [
        path.join(teacherDir, '老师作业要求汇总.pdf'),
        path.join(teacherDir, '老师指定题目-电子课本定位版.pdf'),
        path.join(teacherDir, '老师要求截图原图.pdf'),
      ],
    },
    {
      title: '图片题整合 PDF',
      description: '120 张微信题图已按主题拆成 4 本 PDF，适合手机、平板和电脑连续刷题。',
      files: [
        path.join(imageDir, '01_向量代数-图片题.pdf'),
        path.join(imageDir, '02_空间解析几何-图片题.pdf'),
        path.join(imageDir, '03_第五章多元函数微分学-图片题.pdf'),
        path.join(imageDir, '04_第六章多元函数积分学-图片题.pdf'),
      ],
    },
    {
      title: '单元自测题与解答',
      description: '覆盖向量代数、第五章、第六章和第七章的章节自测题与参考解答。',
      files: [
        path.join(practiceDir, '向量代数与空间解析几何-单元自测题.pdf'),
        path.join(practiceDir, '向量代数与空间解析几何-解答.pdf'),
        path.join(practiceDir, '第五章 多元函数微分学及其应用-单元自测题.pdf'),
        path.join(practiceDir, '第五章 多元函数微分学及其应用-解答.pdf'),
        path.join(practiceDir, '第六章第一单元-重积分-单元自测题.pdf'),
        path.join(practiceDir, '第六章第一单元-重积分-解答.pdf'),
        path.join(practiceDir, '第六章第二单元-曲线与曲面积分-单元自测题.pdf'),
        path.join(practiceDir, '第六章第二单元-曲线与曲面积分-解答.pdf'),
        path.join(practiceDir, '第七章 无穷级数-单元自测题.pdf'),
        path.join(practiceDir, '第七章 无穷级数-解答.pdf'),
      ],
    },
    {
      title: '公式与补充习题',
      description: '用于查公式和补充练习，适合查漏补缺时配合前面的章节材料一起使用。',
      files: [
        path.join(practiceDir, '数学公式.pdf'),
        path.join(supplementDir, '习题1.pdf'),
        path.join(supplementDir, '习题2.pdf'),
        path.join(supplementDir, '习题3.pdf'),
        path.join(supplementDir, '习题4.pdf'),
        path.join(supplementDir, '习题5.pdf'),
        path.join(supplementDir, '习题6.pdf'),
      ],
    },
  ],
  excluded: [
    path.join(practiceDir, '工科数学分析基础 第3版 下册.pdf'),
    path.join(teacherDir, '原始截图PNG'),
    path.join(sourceRoot, '00_说明', 'README.md'),
  ],
};

function allFiles(spec) {
  return spec.sections.flatMap((section) => section.files);
}

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

async function ensurePage(page, csrf, spec) {
  let treeData = await fetchTree(page, parent);
  let node = (treeData.data.tree.child_map[parent] || [])
    .map((token) => treeData.data.tree.nodes[token])
    .find((child) => child?.title === spec.title);
  if (node) return { node, created: false };

  const result = await page.evaluate(async ({ spaceId, parentToken, title, csrfToken }) => {
    const response = await fetch('/space/api/wiki/v2/tree/create_node/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrftoken': csrfToken,
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
    return { status: response.status, text: await response.text() };
  }, { spaceId, parentToken: parent, title: spec.title, csrfToken: csrf });

  if (result.status >= 300) throw new Error(`Cannot create ${spec.title}: ${result.status} ${result.text}`);

  await page.waitForTimeout(1000);
  treeData = await fetchTree(page, parent);
  node = (treeData.data.tree.child_map[parent] || [])
    .map((token) => treeData.data.tree.nodes[token])
    .find((child) => child?.title === spec.title);
  if (!node) throw new Error(`Created page is missing from tree: ${spec.title}`);
  return { node, created: true };
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

async function publishPage(page, csrf, spec) {
  const ensured = await ensurePage(page, csrf, spec);
  const url = `${origin}/wiki/${ensured.node.wiki_token}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const deletedProbeLines = await deleteProbeLines(page);
  const repairedRecord = await repairSplitRecord(page);

  let text = clean(await page.locator('body').innerText());
  if (!text.includes(`本页整理于 ${publishDate}`)) {
    await appendRich(
      page,
      `资料说明\n${spec.description}\n适合查看：${spec.audience}\n使用前请注意：${spec.note}\n整理记录：本页整理于 ${publishDate}，已按复习场景重新整理上传。`,
      `<h1>资料说明</h1><p>${escapeHtml(spec.description)}</p><blockquote><strong>适合查看：</strong>${escapeHtml(spec.audience)}</blockquote><blockquote><strong>使用前请注意：</strong>${escapeHtml(spec.note)}</blockquote><p><strong>整理记录：</strong>本页整理于 ${publishDate}，已按复习场景重新整理上传。</p>`,
    );
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
  }

  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const finalLabels = await readAttachmentLabels(page);
  const missing = allFiles(spec).filter((filePath) => !hasAttachment(finalLabels, filePath));

  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, `review-${spec.title.replaceAll(/[<>:"/\\|?*]/g, '-')}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    title: spec.title,
    url,
    created: ensured.created,
    deletedProbeLines,
    repairedRecord,
    expected: allFiles(spec).length,
    uploaded: uploaded.map((filePath) => path.basename(filePath)),
    missing: missing.map((filePath) => path.basename(filePath)),
    excludedFromUpload: spec.excluded.map((entry) => path.basename(entry)),
    screenshotPath,
  };
}

for (const filePath of allFiles(pageSpec)) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing source file: ${filePath}`);
}

if (process.env.DRY_RUN === '1') {
  console.log(JSON.stringify({
    title: pageSpec.title,
    files: allFiles(pageSpec).map((filePath) => path.basename(filePath)),
    excludedFromUpload: pageSpec.excluded.map((entry) => path.basename(entry)),
  }, null, 2));
  process.exit(0);
}

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
if (!csrf) throw new Error('Missing Feishu CSRF token; the saved browser profile may need sign-in.');

const result = await publishPage(page, csrf, pageSpec);
const report = {
  publishedAt: publishDate,
  pageCount: 1,
  expectedFiles: result.expected,
  uploadedFiles: result.uploaded.length,
  missingFiles: result.missing.length,
  results: [result],
};

fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, 'feishu-upload-report-engineering-math-analysis.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));

await context.close();
