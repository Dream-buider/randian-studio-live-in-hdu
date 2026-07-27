import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = path.join(root, '.pw-edge-profile');
const origin = 'https://scnbcye3xdfz.feishu.cn';
const parentToken = 'EdTqwwPDwiuNuwkJjUecYCB5ncf';
const pageUrl = `${origin}/wiki/${parentToken}`;

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

async function fetchTree(page, token) {
  return page.evaluate(async (wikiToken) => {
    const response = await fetch(`/space/api/wiki/v2/tree/get_info/?wiki_token=${wikiToken}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=true`, { credentials: 'include' });
    return response.json();
  }, token);
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

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: edgePath,
  headless: false,
  viewport: { width: 1456, height: 900 },
  args: ['--start-maximized'],
});

await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = context.pages()[0] ?? await context.newPage();
await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const treeData = await fetchTree(page, parentToken);
const tree = treeData.data.tree;
const children = (tree.child_map[parentToken] || [])
  .map((token) => ({
    title: tree.nodes[token]?.title,
    url: tree.nodes[token]?.url,
  }))
  .filter((item) => item.title && item.url)
  .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));

const reviewPages = children.filter((item) => item.title.startsWith('期末复习 | '));
const otherPages = children.filter((item) => !item.title.startsWith('期末复习 | '));

const bodyText = clean(await page.locator('body').innerText());
if (!bodyText.includes('课程复习直达入口')) {
  const plainSections = [];
  plainSections.push('课程复习直达入口');
  plainSections.push('点击下面的课程名，可以直接跳转到对应子页面。');
  if (reviewPages.length) {
    plainSections.push('');
    plainSections.push('期末复习专区');
    for (const item of reviewPages) plainSections.push(`- ${item.title}`);
  }
  if (otherPages.length) {
    plainSections.push('');
    plainSections.push('其他课程资料');
    for (const item of otherPages) plainSections.push(`- ${item.title}`);
  }

  const reviewHtml = reviewPages.map((item) => `<li><a href="${item.url}">${item.title}</a></li>`).join('');
  const otherHtml = otherPages.map((item) => `<li><a href="${item.url}">${item.title}</a></li>`).join('');
  const htmlSections = [
    '<h2>课程复习直达入口</h2>',
    '<p>点击下面的课程名，可以直接跳转到对应子页面。</p>',
    reviewPages.length ? `<h3>期末复习专区</h3><ul>${reviewHtml}</ul>` : '',
    otherPages.length ? `<h3>其他课程资料</h3><ul>${otherHtml}</ul>` : '',
  ].filter(Boolean).join('');

  const editButton = page.getByRole('button', { name: '编辑' }).last();
  if (await editButton.count()) {
    await editButton.click();
    await page.waitForTimeout(2500);
  }

  const editors = page.locator('.zone-container.text-editor');
  const count = await editors.count();
  if (count < 1) throw new Error(`Cannot find body editor. Found ${count} editors.`);
  await editors.last().click({ position: { x: 30, y: 12 } });
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await setClipboard(page, plainSections.join('\n'), htmlSections);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(8000);
}

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const verification = await page.evaluate(() => {
  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const body = normalize(document.body.innerText);
  const links = [...document.querySelectorAll('a')]
    .map((el) => ({ text: normalize(el.innerText), href: el.href }))
    .filter((item) => item.text && item.href.includes('/wiki/'));
  return { body, links };
});

const missing = children.filter((item) => !verification.links.some((link) => link.text === item.title));
if (!verification.body.includes('课程复习直达入口') || missing.length) {
  throw new Error(`Verification failed. Missing links: ${missing.map((item) => item.title).join(', ')}`);
}

console.log(JSON.stringify({
  updated: true,
  pageUrl,
  childCount: children.length,
  linkedTitles: children.map((item) => item.title),
}, null, 2));

await context.close();
