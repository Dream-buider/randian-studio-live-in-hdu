import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { importWebbridgeFeishuCookies } from './feishu-auth-bridge.mjs';
import { WebBridgeClient } from './webbridge-client.mjs';

const root = process.cwd();
const origin = 'https://scnbcye3xdfz.feishu.cn';
const reportPath = path.join(root, 'docs', '社区更新_2026-07-15', 'feishu-upload-report-latest-materials.json');
const screenshotDir = path.join(root, 'output', 'playwright', 'latest-materials-2026-07-15');
const repairReportPath = path.join(root, 'docs', '社区更新_2026-07-15', 'title-repair-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const targets = report.pageResults.filter((item) => item.created);

function clean(text) {
  return (text || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

function safeName(text) {
  return text.replaceAll(/[<>:"/\\|?*]/g, '-');
}

async function enterEditMode(page) {
  const button = page.locator('button.docs_mode_switch_dropdown_btn:visible').last();
  await button.waitFor({ state: 'visible', timeout: 15000 });
  await button.click();
  await page.waitForTimeout(600);
  const item = page.getByRole('menuitem').filter({ hasText: '可编辑文档' }).last();
  if (await item.count() && await item.isVisible()) await item.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
}

async function renameNode(page, csrf, target) {
  const result = await page.evaluate(async ({ wikiToken, title, csrfToken }) => {
    const response = await fetch('/space/api/wiki/v2/tree/update_title/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrftoken': csrfToken,
        'doc-platform': 'web',
      },
      body: JSON.stringify({ wiki_token: wikiToken, obj_token: '', name: title }),
    });
    return { status: response.status, text: await response.text() };
  }, { wikiToken: target.token, title: target.title, csrfToken: csrf });
  if (result.status >= 300) throw new Error(`Cannot restore title ${target.title}: ${result.status} ${result.text.slice(0, 400)}`);
}

async function removeSplitSuffix(page, target) {
  const suffix = clean(target.title.slice(1));
  const prepared = await page.evaluate((expected) => {
    const editors = [...document.querySelectorAll('.zone-container.text-editor')];
    const match = editors.find((element) => (element.innerText || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim() === expected);
    if (!match) return false;
    match.id = 'codex-split-title-suffix';
    match.focus();
    const range = document.createRange();
    range.selectNodeContents(match);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }, suffix);
  if (!prepared) return false;
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1200);
  return true;
}

const context = await chromium.launchPersistentContext(path.join(root, '.pw-edge-profile'), {
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: false,
  viewport: { width: 1456, height: 900 },
  args: ['--start-maximized'],
});
await importWebbridgeFeishuCookies({
  client: new WebBridgeClient({ session: process.env.WEBBRIDGE_SESSION || 'hdu-publish' }),
  context,
});
const page = context.pages()[0] ?? await context.newPage();
const csrf = (await context.cookies()).find((cookie) => cookie.name === '_csrf_token')?.value;
if (!csrf) throw new Error('Missing Feishu CSRF token.');

const results = [];
try {
  for (const target of targets) {
    await page.goto(target.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await renameNode(page, csrf, target);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await enterEditMode(page);
    const removedSplitSuffix = await removeSplitSuffix(page, target);
    await page.waitForTimeout(1800);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const titleText = clean(await page.locator('.zone-container.text-editor').first().innerText());
    const bodyText = clean(await page.locator('body').innerText());
    const suffix = clean(target.title.slice(1));
    const suffixStillStandalone = await page.locator('.zone-container.text-editor').evaluateAll((editors, expected) => editors.some((element) => (element.innerText || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim() === expected), suffix);
    if (titleText !== target.title || suffixStillStandalone || !bodyText.includes(`本页资料核验于 ${report.publishedAt}`)) {
      throw new Error(`Title repair verification failed for ${target.title}: title=${titleText}, suffixStillStandalone=${suffixStillStandalone}`);
    }
    const screenshotPath = path.join(screenshotDir, `${safeName(target.title)}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    results.push({ title: target.title, token: target.token, url: target.url, removedSplitSuffix, verifiedTitle: titleText, suffixStillStandalone, screenshotPath });
  }
  const repairReport = { repairedAt: '2026-07-15', targetCount: targets.length, verifiedCount: results.length, results };
  fs.writeFileSync(repairReportPath, JSON.stringify(repairReport, null, 2), 'utf8');
  console.log(JSON.stringify({ ...repairReport, repairReportPath }, null, 2));
} finally {
  await context.close();
}
