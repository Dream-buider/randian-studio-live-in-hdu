import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const requestedOutput = process.argv[2] ?? 'dist/client';
const outputDir = path.resolve(appRoot, requestedOutput);
const forbiddenPreviewMarkers = [
  'ui-preview-registration',
  '新生报到前需要准备哪些材料？',
  '宿舍环境怎么样，需要自带哪些生活用品？',
];

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  }));
  return files.flat();
}

for (const file of await collectFiles(outputDir)) {
  if (!/\.(?:css|html|js)$/.test(file)) {
    continue;
  }
  const content = await readFile(file, 'utf8');
  const matched = forbiddenPreviewMarkers.find((marker) => content.includes(marker));
  if (matched) {
    throw new Error(
      `Production-facing bundle contains UI preview data marker "${matched}" in ${path.relative(appRoot, file)}`,
    );
  }
}
