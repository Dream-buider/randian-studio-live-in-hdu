import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(appRoot, 'dist', 'public-trial-client');
const assetsDir = path.join(outputDir, 'assets');
const forbidden = [
  'AdminView',
  '内容与审核控制台',
  '/api/admin/intents',
  '/api/reviews',
];

const files = await readdir(assetsDir);
const javascript = files.filter((file) => file.endsWith('.js'));
for (const file of javascript) {
  const content = await readFile(path.join(assetsDir, file), 'utf8');
  const matched = forbidden.find((value) => file.includes(value) || content.includes(value));
  if (matched) {
    throw new Error(`Public trial bundle contains forbidden admin marker: ${matched}`);
  }
}
