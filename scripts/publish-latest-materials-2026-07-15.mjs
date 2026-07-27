import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { pageSpecs, publishDate, skippedFiles, validateManifest } from './latest-materials-2026-07-15-manifest.mjs';
import { importWebbridgeFeishuCookies } from './feishu-auth-bridge.mjs';
import { WebBridgeClient } from './webbridge-client.mjs';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const sourceDir = path.join(root, '最新资料');
const reportDir = path.join(root, 'docs', '社区更新_2026-07-15');
const screenshotDir = path.join(root, 'output', 'playwright', 'latest-materials-2026-07-15');
const origin = 'https://scnbcye3xdfz.feishu.cn';
const startUrl = `${origin}/wiki/EdTqwwPDwiuNuwkJjUecYCB5ncf`;
const spaceId = '7639362813286190049';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(root, '.pw-edge-profile');
const webbridgeSession = process.env.WEBBRIDGE_SESSION || 'hdu-publish';

function clean(text) {
  return (text || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function allFiles(spec) {
  return spec.sections.flatMap((section) => section.files);
}

function safeName(text) {
  return text.replaceAll(/[<>:"/\\|?*]/g, '-');
}

async function fetchTree(page, token) {
  const result = await page.evaluate(async (wikiToken) => {
    const response = await fetch(`/space/api/wiki/v2/tree/get_info/?wiki_token=${wikiToken}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=false`, { credentials: 'include' });
    const text = await response.text();
    const start = text.indexOf('{');
    return { status: response.status, text, json: start >= 0 ? JSON.parse(text.slice(start)) : null };
  }, token);
  if (result.status >= 300 || result.json?.code !== 0) throw new Error(`Cannot read wiki tree for ${token}: ${result.status} ${result.text.slice(0, 300)}`);
  return result.json;
}

async function findChild(page, parentToken, title) {
  const treeData = await fetchTree(page, parentToken);
  const tree = treeData.data.tree;
  return (tree.child_map[parentToken] || []).map((token) => tree.nodes[token]).find((node) => node?.title === title) || null;
}

async function ensurePage(page, csrf, spec) {
  let node = await findChild(page, spec.parentToken, spec.title);
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
        synergy_uuid: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        template_token: '',
        title: titleValue,
      }),
    });
    return { status: response.status, text: await response.text() };
  }, { spaceIdValue: spaceId, parentTokenValue: spec.parentToken, titleValue: spec.title, csrfValue: csrf });
  if (result.status >= 300) throw new Error(`Cannot create page ${spec.title}: ${result.status} ${result.text.slice(0, 500)}`);
  await page.waitForTimeout(1200);
  node = await findChild(page, spec.parentToken, spec.title);
  if (!node) throw new Error(`Created page is missing from parent tree: ${spec.title}`);
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

async function enterEditMode(page) {
  const visibleButton = page.locator('button.docs_mode_switch_dropdown_btn:visible').last();
  if (await visibleButton.count()) {
    await visibleButton.click();
    await page.waitForTimeout(700);
    const editableMenu = page.getByRole('menuitem').filter({ hasText: '可编辑文档' }).last();
    if (await editableMenu.count() && await editableMenu.isVisible()) {
      await editableMenu.click();
      await page.waitForTimeout(1800);
    }
  }
}

async function initializeNewPageBody(page, created) {
  if (!created) return;
  const titleEditor = page.locator('.zone-container.text-editor:visible').first();
  await titleEditor.waitFor({ state: 'visible', timeout: 15000 });
  await titleEditor.click({ position: { x: 30, y: 12 } });
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
}

async function moveToEnd(page, { append = true } = {}) {
  await page.evaluate(() => {
    const container = document.querySelector('.bear-web-x-container');
    if (container) container.scrollTop = container.scrollHeight;
    else window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(700);
  const prepared = await page.evaluate(() => {
    document.getElementById('codex-bottom-editor')?.removeAttribute('id');
    const editors = [...document.querySelectorAll('.zone-container.text-editor')];
    const visible = editors.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0 && rect.height > 0;
    });
    const target = visible[visible.length - 1] || editors[editors.length - 1];
    if (!target) return false;
    target.id = 'codex-bottom-editor';
    return true;
  });
  if (!prepared) throw new Error('Cannot locate a writable document body.');
  await page.locator('#codex-bottom-editor').click({ position: { x: 30, y: 12 } });
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
  return clean(text).replaceAll(/\s+/g, '').replace(/\d+(?:\.\d+)?(?:KB|MB|GB)$/i, '');
}

async function readAttachmentLabels(page) {
  const scroll = await page.evaluate(() => {
    const container = document.querySelector('.bear-web-x-container');
    return container ? { top: container.scrollTop, height: container.scrollHeight, viewport: container.clientHeight } : { top: 0, height: document.body.scrollHeight, viewport: window.innerHeight };
  });
  const labels = new Set();
  const step = Math.max(480, Math.floor(scroll.viewport * 0.7));
  for (let top = 0; top <= scroll.height + step; top += step) {
    await page.evaluate((value) => {
      const container = document.querySelector('.bear-web-x-container');
      if (container) container.scrollTop = value;
      else window.scrollTo(0, value);
    }, top);
    await page.waitForTimeout(180);
    const visible = await page.locator('.docx-file-block').evaluateAll((blocks) => blocks.map((block) => (block.innerText || '').replace(/\u200b/g, '').trim()));
    for (const label of visible) labels.add(normalizeFileLabel(label));
  }
  await page.evaluate((value) => {
    const container = document.querySelector('.bear-web-x-container');
    if (container) container.scrollTop = value;
    else window.scrollTo(0, value);
  }, scroll.top);
  return labels;
}

function includesAttachment(labels, filename) {
  const expected = normalizeFileLabel(filename);
  return [...labels].some((label) => label.includes(expected));
}

async function uploadFiles(page, filenames) {
  const filePaths = filenames.map((filename) => path.join(sourceDir, filename));
  await moveToEnd(page);
  await page.keyboard.type('/', { delay: 80 });
  await page.waitForTimeout(900);
  const menuItem = page.getByText('视频或文件', { exact: true }).last();
  await menuItem.waitFor({ state: 'visible', timeout: 15000 });
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
  await menuItem.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePaths);
  const totalMb = filePaths.reduce((sum, filePath) => sum + fs.statSync(filePath).size / 1024 / 1024, 0);
  await page.waitForTimeout(Math.max(8000, Math.min(70000, 5000 + totalMb * 1300 + filenames.length * 1000)));
}

async function waitForAttachments(page, filenames, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  let missing = filenames;
  while (Date.now() < deadline) {
    const labels = await readAttachmentLabels(page);
    missing = filenames.filter((filename) => !includesAttachment(labels, filename));
    if (!missing.length) return [];
    await page.waitForTimeout(5000);
  }
  return missing;
}

async function publishPage(page, csrf, spec) {
  const ensured = await ensurePage(page, csrf, spec);
  const url = `${origin}/wiki/${ensured.node.wiki_token}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await enterEditMode(page);
  await initializeNewPageBody(page, ensured.created);

  let text = await readBodyText(page);
  const headerMarker = `本页资料核验于 ${publishDate}`;
  if (!text.includes(headerMarker)) {
    const plain = `资料说明\n${spec.description}\n\n适合查看：${spec.audience}\n\n使用前请注意：${spec.note}\n\n整理记录：本页资料核验于 ${publishDate}，由 LIVE IN HDU 社区整理发布。`;
    const html = `<h1>资料说明</h1><p>${escapeHtml(spec.description)}</p><blockquote><strong>适合查看：</strong>${escapeHtml(spec.audience)}</blockquote><blockquote><strong>使用前请注意：</strong>${escapeHtml(spec.note)}</blockquote><p><strong>整理记录：</strong>本页资料核验于 ${publishDate}，由 LIVE IN HDU 社区整理发布。</p>`;
    await appendRich(page, plain, html);
    text = await readBodyText(page);
  }

  const uploaded = [];
  let attachmentLabels = await readAttachmentLabels(page);
  for (const section of spec.sections) {
    if (!text.includes(section.title)) {
      await appendRich(page, `${section.title}\n${section.description}`, `<h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.description)}</p>`);
      text = await readBodyText(page);
    }
    const missing = section.files.filter((filename) => !includesAttachment(attachmentLabels, filename));
    for (let start = 0; start < missing.length; start += 8) {
      const batch = missing.slice(start, start + 8);
      await uploadFiles(page, batch);
      const stillMissing = await waitForAttachments(page, batch);
      if (stillMissing.length) throw new Error(`Upload did not become visible on ${spec.title}: ${stillMissing.join(', ')}`);
      uploaded.push(...batch);
      attachmentLabels = await readAttachmentLabels(page);
    }
  }

  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const finalText = await readBodyText(page);
  const finalLabels = await readAttachmentLabels(page);
  const missingAfterUpload = allFiles(spec).filter((filename) => !includesAttachment(finalLabels, filename));
  if (!finalText.includes(headerMarker) || missingAfterUpload.length) {
    throw new Error(`Verification failed for ${spec.title}: marker=${finalText.includes(headerMarker)}, missing=${missingAfterUpload.join(', ')}`);
  }
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, `${safeName(spec.title)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return { title: spec.title, category: spec.category, url, token: ensured.node.wiki_token, created: ensured.created, expectedFiles: allFiles(spec), uploaded, missingAfterUpload, containsHeader: true, screenshotPath };
}

const validation = validateManifest({ sourceDir });
fs.mkdirSync(reportDir, { recursive: true });
const context = await chromium.launchPersistentContext(userDataDir, { executablePath: edgePath, headless: false, viewport: { width: 1456, height: 900 }, args: ['--start-maximized'] });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const authBridge = await importWebbridgeFeishuCookies({
  client: new WebBridgeClient({ session: webbridgeSession }),
  context,
});
const page = context.pages()[0] ?? await context.newPage();
try {
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  if (page.url().includes('/accounts/page/login')) throw new Error('Feishu session is not signed in. Run sync-feishu-auth-from-webbridge.mjs first.');
  const csrf = (await context.cookies()).find((cookie) => cookie.name === '_csrf_token')?.value;
  if (!csrf) throw new Error('Missing Feishu CSRF token.');

  if (dryRun) {
    const pages = [];
    for (const spec of pageSpecs) {
      const existing = await findChild(page, spec.parentToken, spec.title);
      pages.push({ title: spec.title, category: spec.category, parentToken: spec.parentToken, existing: Boolean(existing), token: existing?.wiki_token || null, expectedFiles: allFiles(spec) });
    }
    const report = { mode: 'dry-run', publishDate, validation, skippedFiles, pages };
    const reportPath = path.join(reportDir, 'publish-dry-run.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ ...report, authBridge, reportPath }, null, 2));
  } else {
    const pageResults = [];
    for (const spec of pageSpecs) pageResults.push(await publishPage(page, csrf, spec));
    const report = {
      mode: 'live',
      publishedAt: publishDate,
      validation,
      pageCount: pageResults.length,
      expectedFileCount: pageSpecs.flatMap(allFiles).length,
      uploadedFileCount: pageResults.flatMap((item) => item.uploaded).length,
      missingFileCount: pageResults.flatMap((item) => item.missingAfterUpload).length,
      skippedFiles,
      pageResults,
    };
    const reportPath = path.join(reportDir, 'feishu-upload-report-latest-materials.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  }
} finally {
  await context.close();
}
