import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const origin = 'https://scnbcye3xdfz.feishu.cn';
const rootToken = 'I0OwwcBeLiIHZOkmpTScv0MEnyc';
const context = await chromium.launchPersistentContext(path.join(root, '.pw-edge-profile'), {
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: false,
  viewport: { width: 1456, height: 900 },
});
const page = context.pages()[0] ?? await context.newPage();
await page.goto(`${origin}/wiki/${rootToken}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
console.error(`Loaded: ${page.url()}`);
const payload = await page.evaluate(async (wikiToken) => {
  const response = await fetch(`/space/api/wiki/v2/tree/get_info/?wiki_token=${wikiToken}&with_space=true&with_perm=true&expand_shortcut=true&need_shared=true&exclude_fields=5&with_deleted=false`, { credentials: 'include' });
  const text = await response.text();
  const jsonStart = text.indexOf('{');
  if (jsonStart < 0) throw new Error(`Tree endpoint returned ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text.slice(jsonStart));
}, rootToken);
const tree = payload?.data?.tree;
if (!tree?.nodes || !tree?.child_map) throw new Error(`Unexpected tree response: ${JSON.stringify(payload).slice(0, 500)}`);
const rows = [];
function walk(token, depth = 0, ancestors = []) {
  const node = tree.nodes[token];
  if (!node) return;
  const pathParts = [...ancestors, node.title];
  rows.push({ depth, token, title: node.title, path: pathParts.join(' / ') });
  for (const child of tree.child_map[token] ?? []) walk(child, depth + 1, pathParts);
}
walk(rootToken);
console.log(JSON.stringify(rows, null, 2));
await context.close();
