import fs from 'node:fs';
import path from 'node:path';
import { pageSpecs, publishDate, skippedFiles, validateManifest } from './latest-materials-2026-07-15-manifest.mjs';
import { WebBridgeClient } from './webbridge-client.mjs';

const root = process.cwd();
const origin = 'https://scnbcye3xdfz.feishu.cn';
const startUrl = `${origin}/wiki/EdTqwwPDwiuNuwkJjUecYCB5ncf`;
const sourceDir = path.join(root, '最新资料');
const reportDir = path.join(root, 'docs', '社区更新_2026-07-15');
const screenshotDir = path.join(root, 'output', 'webbridge', 'latest-materials-2026-07-15');
const spaceId = '7639362813286190049';
const client = new WebBridgeClient({ session: 'hdu-publish', timeoutMs: 240000 });

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function allFiles(spec) {
  return spec.sections.flatMap((section) => section.files);
}

function safeName(text) {
  return text.replaceAll(/[<>:"/\\|?*]/g, '-');
}

function js(value) {
  return JSON.stringify(value);
}

async function assertWritable() {
  const state = await client.evaluate(`(() => ({
    url: location.href,
    hasVisibleEditButton: [...document.querySelectorAll('button')].some((element) => (element.innerText || '').trim() === '编辑' && (element.offsetWidth || element.offsetHeight)),
    hasLoginButton: [...document.querySelectorAll('button')].some((element) => (element.innerText || '').includes('登录/注册') && (element.offsetWidth || element.offsetHeight))
  }))()`);
  if (!state.url.includes('scnbcye3xdfz.feishu.cn/wiki/') || !state.hasVisibleEditButton || state.hasLoginButton) {
    throw new Error(`Authenticated writable Feishu tab is unavailable: ${JSON.stringify(state)}`);
  }
}

async function findChild(parentToken, title) {
  return client.evaluateAsync(`(async () => {
    const response = await fetch('/space/api/wiki/v2/tree/get_info/?wiki_token=' + ${js(parentToken)} + '&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=false', { credentials: 'include' });
    const text = await response.text();
    const start = text.indexOf('{');
    const payload = start >= 0 ? JSON.parse(text.slice(start)) : null;
    if (response.status >= 300 || payload?.code !== 0) throw new Error('tree lookup failed: ' + response.status + ' ' + text.slice(0, 300));
    const tree = payload.data.tree;
    return (tree.child_map[${js(parentToken)}] || []).map((token) => tree.nodes[token]).find((node) => node?.title === ${js(title)}) || null;
  })()`);
}

async function ensurePage(spec) {
  let node = await findChild(spec.parentToken, spec.title);
  if (node) return { node, created: false };
  const result = await client.evaluateAsync(`(async () => {
    const csrf = document.cookie.split('; ').find((item) => item.startsWith('_csrf_token='))?.split('=').slice(1).join('=');
    if (!csrf) throw new Error('missing csrf token');
    const response = await fetch('/space/api/wiki/v2/tree/create_node/', {
      method: 'POST', credentials: 'include',
      headers: {
        'content-type': 'application/json', 'x-csrftoken': csrf,
        'docs-host-id': ${js(spec.parentToken)}, 'docs-host-type': 'Wiki',
        'doc-platform': 'web', 'x-lsc-terminal': 'web'
      },
      body: JSON.stringify({
        space_id: ${js(spaceId)}, parent_wiki_token: ${js(spec.parentToken)}, ua_type: 'Web', scene: 'wiki_create',
        obj_type: 22, node_type: 0, synergy_uuid: Date.now() + '-' + Math.random().toString(16).slice(2), template_token: '', title: ${js(spec.title)}
      })
    });
    return { status: response.status, text: await response.text() };
  })()`);
  if (result.status >= 300) throw new Error(`Cannot create ${spec.title}: ${result.status} ${result.text.slice(0, 500)}`);
  await client.wait(1600);
  node = await findChild(spec.parentToken, spec.title);
  if (!node) throw new Error(`Created page is missing from tree: ${spec.title}`);
  return { node, created: true };
}

async function enterEditMode() {
  const prepared = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button.docs_mode_switch_dropdown_btn')].find((element) => element.offsetWidth || element.offsetHeight);
    if (!button) return false;
    button.id = 'codex-edit-button';
    return true;
  })()`);
  if (!prepared) throw new Error('Visible Edit button is missing.');
  await client.command('mouse_click', { selector: '#codex-edit-button' });
  await client.wait(600);
  const menuPrepared = await client.evaluate(`(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((element) => (element.innerText || '').includes('可编辑文档') && (element.offsetWidth || element.offsetHeight));
    if (!item) return false;
    item.id = 'codex-edit-mode-item';
    return true;
  })()`);
  if (menuPrepared) {
    await client.command('mouse_click', { selector: '#codex-edit-mode-item' });
    await client.wait(1800);
  } else {
    await client.command('send_keys', { keys: 'Escape' });
  }
}

async function scrollToBottom() {
  await client.evaluate(`(() => {
    const container = document.querySelector('.bear-web-x-container');
    if (container) container.scrollTop = container.scrollHeight;
    else window.scrollTo(0, document.body.scrollHeight);
    return true;
  })()`);
  await client.wait(900);
}

async function focusBottom({ newLine = true } = {}) {
  await scrollToBottom();
  const prepared = await client.evaluate(`(() => {
    const editors = [...document.querySelectorAll('.zone-container.text-editor')];
    const visible = editors.filter((element) => { const rect = element.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0 && rect.height > 0; });
    const target = visible[visible.length - 1] || editors[editors.length - 1];
    if (!target) return false;
    target.id = 'codex-bottom-editor';
    return true;
  })()`);
  if (!prepared) throw new Error('Cannot locate the bottom editor block.');
  await client.command('mouse_click', { selector: '#codex-bottom-editor' });
  await client.command('send_keys', { keys: 'Mod+End' });
  if (newLine) await client.command('send_keys', { keys: 'Enter' });
  await client.wait(250);
}

async function copyRichToClipboard(plain, html) {
  await client.evaluate(`(() => {
    document.getElementById('codex-clipboard-source')?.remove();
    const source = document.createElement('div');
    source.id = 'codex-clipboard-source';
    source.contentEditable = 'true';
    source.style.cssText = 'position:fixed;left:8px;top:8px;width:4px;height:4px;opacity:0.01;overflow:hidden;z-index:2147483647;';
    source.innerHTML = ${js(html)};
    source.setAttribute('data-plain', ${js(plain)});
    document.body.appendChild(source);
    source.focus();
    const range = document.createRange();
    range.selectNodeContents(source);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  })()`);
  await client.command('send_keys', { keys: 'Mod+C' });
  await client.wait(250);
  await client.evaluate(`(() => { document.getElementById('codex-clipboard-source')?.remove(); return true; })()`);
}

async function appendRich(plain, html, marker) {
  await copyRichToClipboard(plain, html);
  await focusBottom({ newLine: true });
  await client.command('send_keys', { keys: 'Mod+V' });
  await client.wait(2200);
  await scrollToBottom();
  const present = await client.evaluate(`(() => document.body.innerText.includes(${js(marker)}))()`);
  if (!present) throw new Error(`Pasted content marker is not visible: ${marker}`);
}

async function scanPage() {
  const state = await client.evaluate(`(() => {
    const container = document.querySelector('.bear-web-x-container');
    return container ? { height: container.scrollHeight, viewport: container.clientHeight, top: container.scrollTop } : { height: document.body.scrollHeight, viewport: innerHeight, top: scrollY };
  })()`);
  const labels = new Set();
  let text = '';
  const step = Math.max(500, Math.floor(state.viewport * 0.7));
  for (let top = 0; top <= state.height + step; top += step) {
    const sample = await client.evaluate(`(() => {
      const container = document.querySelector('.bear-web-x-container');
      if (container) container.scrollTop = ${top}; else window.scrollTo(0, ${top});
      return true;
    })()`);
    void sample;
    await client.wait(180);
    const visible = await client.evaluate(`(() => ({
      text: document.body.innerText,
      labels: [...document.querySelectorAll('.docx-file-block')].map((block) => (block.innerText || '').replace(/\\u200b/g, '').trim())
    }))()`);
    text += `\n${visible.text}`;
    for (const label of visible.labels) labels.add(label.replace(/\s+/g, ''));
  }
  await client.evaluate(`(() => { const container = document.querySelector('.bear-web-x-container'); if (container) container.scrollTop = ${state.top}; else window.scrollTo(0, ${state.top}); return true; })()`);
  return { labels, text: text.replace(/\u200b/g, '').replace(/\s+/g, ' ') };
}

function includesAttachment(labels, filename) {
  const expected = filename.replace(/\s+/g, '');
  return [...labels].some((label) => label.includes(expected));
}

async function dispatchSlash() {
  await client.command('cdp', { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: '/', code: 'Slash', windowsVirtualKeyCode: 191, text: '/' } });
  await client.command('cdp', { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 } });
}

async function uploadBatch(filenames) {
  await focusBottom({ newLine: true });
  await dispatchSlash();
  await client.wait(900);
  const itemPrepared = await client.evaluate(`(() => {
    const item = [...document.querySelectorAll('*')].find((element) => element.children.length === 0 && (element.innerText || '').trim() === '视频或文件' && (element.offsetWidth || element.offsetHeight));
    if (!item) return false;
    item.id = 'codex-file-menu-item';
    return true;
  })()`);
  if (!itemPrepared) throw new Error('Trusted slash menu opened but 视频或文件 item is missing.');
  await client.command('mouse_click', { selector: '#codex-file-menu-item' });
  await client.wait(700);
  const inputPrepared = await client.evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    const input = inputs[inputs.length - 1];
    if (!input) return { ok: false, count: 0 };
    input.id = 'codex-file-input';
    return { ok: true, count: inputs.length, accept: input.accept, multiple: input.multiple };
  })()`);
  if (!inputPrepared.ok) throw new Error('File chooser opened without a DOM file input.');
  const files = filenames.map((filename) => path.join(sourceDir, filename));
  await client.command('upload', { selector: '#codex-file-input', files });
  const totalMb = files.reduce((sum, file) => sum + fs.statSync(file).size / 1024 / 1024, 0);
  await client.wait(Math.max(10000, Math.min(90000, 6000 + totalMb * 1500 + files.length * 1200)));
}

async function waitForFiles(filenames, timeoutMs = 200000) {
  const deadline = Date.now() + timeoutMs;
  let lastMissing = filenames;
  while (Date.now() < deadline) {
    const scan = await scanPage();
    lastMissing = filenames.filter((filename) => !includesAttachment(scan.labels, filename));
    if (!lastMissing.length) return [];
    await client.wait(5000);
  }
  return lastMissing;
}

async function publishPage(spec) {
  const ensured = await ensurePage(spec);
  const url = `${origin}/wiki/${ensured.node.wiki_token}`;
  console.log(`[page] ${spec.title} -> ${url} (${ensured.created ? 'created' : 'existing'})`);
  await client.navigate(url, { newTab: false });
  await client.wait(4500);
  await assertWritable();
  await enterEditMode();
  let scan = await scanPage();
  const headerMarker = `本页资料核验于 ${publishDate}`;
  if (!scan.text.includes(headerMarker)) {
    const plain = `资料说明\n${spec.description}\n\n适合查看：${spec.audience}\n\n使用前请注意：${spec.note}\n\n整理记录：本页资料核验于 ${publishDate}，由 LIVE IN HDU 社区整理发布。`;
    const html = `<h1>资料说明</h1><p>${escapeHtml(spec.description)}</p><blockquote><strong>适合查看：</strong>${escapeHtml(spec.audience)}</blockquote><blockquote><strong>使用前请注意：</strong>${escapeHtml(spec.note)}</blockquote><p><strong>整理记录：</strong>本页资料核验于 ${publishDate}，由 LIVE IN HDU 社区整理发布。</p>`;
    await appendRich(plain, html, headerMarker);
    console.log(`[text] ${spec.title}: header added`);
  }

  const uploaded = [];
  for (const section of spec.sections) {
    scan = await scanPage();
    if (!scan.text.includes(section.title)) {
      await appendRich(`${section.title}\n${section.description}`, `<h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.description)}</p>`, section.title);
      console.log(`[text] ${spec.title}: section ${section.title} added`);
    }
    scan = await scanPage();
    const missing = section.files.filter((filename) => !includesAttachment(scan.labels, filename));
    for (let start = 0; start < missing.length; start += 8) {
      const batch = missing.slice(start, start + 8);
      console.log(`[upload] ${spec.title}: ${batch.join(' | ')}`);
      await uploadBatch(batch);
      const stillMissing = await waitForFiles(batch);
      if (stillMissing.length) throw new Error(`Upload verification timed out on ${spec.title}: ${stillMissing.join(', ')}`);
      uploaded.push(...batch);
    }
  }

  await client.navigate(url, { newTab: false });
  await client.wait(4500);
  const finalScan = await scanPage();
  const missingAfterUpload = allFiles(spec).filter((filename) => !includesAttachment(finalScan.labels, filename));
  if (!finalScan.text.includes(headerMarker) || missingAfterUpload.length) {
    throw new Error(`Final verification failed on ${spec.title}: marker=${finalScan.text.includes(headerMarker)}, missing=${missingAfterUpload.join(', ')}`);
  }
  await scrollToBottom();
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, `${safeName(spec.title)}.png`);
  await client.command('screenshot', { path: screenshotPath });
  console.log(`[verified] ${spec.title}: ${allFiles(spec).length} files`);
  return { title: spec.title, category: spec.category, url, token: ensured.node.wiki_token, created: ensured.created, expectedFiles: allFiles(spec), uploaded, missingAfterUpload, containsHeader: true, screenshotPath };
}

const validation = validateManifest({ sourceDir });
fs.mkdirSync(reportDir, { recursive: true });
await client.navigate(startUrl, { newTab: false });
await client.wait(4000);
await assertWritable();

const pageResults = [];
for (const spec of pageSpecs) pageResults.push(await publishPage(spec));

const report = {
  mode: 'live-webbridge',
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
