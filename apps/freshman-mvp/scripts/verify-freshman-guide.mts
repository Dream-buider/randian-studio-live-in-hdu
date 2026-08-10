import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFreshmanGuideMarkdown } from '../src/content/freshman-guide-document.js';
import { FRESHMAN_GUIDE_URL } from '../src/content/freshman-guide.js';
import { FreshmanGuideProvider } from '../src/providers/freshman-guide-provider.js';

const related = [
  '学号在哪里查？',
  '航电钉怎么注册？',
  '学校钉钉怎么认证？',
  '杭电宿舍有多大？',
  '宿舍是几人间？',
  '学号查到以后怎么注册杭电钉？',
] as const;
const unrelated = [
  '校内哪里可以修理天文望远镜？',
  '学校体育比赛怎么报名？',
  '快递员怎么应聘？',
] as const;

function fileArgument(args: readonly string[]): string | null {
  const index = args.indexOf('--file');
  const value = index >= 0 ? args[index + 1]?.trim() : '';
  return value && path.isAbsolute(value) ? value : null;
}

function fail(code: string, question?: string): never {
  process.stderr.write(`${code}${question ? ` | ${question}` : ''}\n`);
  process.exit(1);
}

const filePath = fileArgument(process.argv.slice(2));
if (!filePath) {
  fail('GUIDE_FILE_ARGUMENT_ERROR');
}

let markdown: string;
try {
  markdown = await readFile(filePath, 'utf8');
} catch {
  fail('GUIDE_FILE_READ_ERROR');
}

const chunks = parseFreshmanGuideMarkdown(markdown);
if (chunks.length === 0) {
  fail('GUIDE_PARSE_EMPTY');
}

const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
const provider = new FreshmanGuideProvider({ chunks, maxHits: 3 });

for (const question of related) {
  const result = await provider.search(question);
  if (result.hits.length === 0) {
    fail('GUIDE_RELATED_MISS', question);
  }

  const titles: string[] = [];
  const urls: string[] = [];
  for (const hit of result.hits) {
    const chunk = chunksById.get(hit.chunkId);
    const title = chunk?.displayTitle;
    const url = hit.source?.url;
    if (!title || !url || !url.startsWith(FRESHMAN_GUIDE_URL)) {
      fail('GUIDE_SOURCE_URL_REJECTED', question);
    }
    titles.push(title);
    urls.push(url);
  }

  process.stdout.write(`${question} | ${result.hits.length} | ${titles.join('；')} | ${urls.join('；')}\n`);
}

for (const question of unrelated) {
  const unrelatedResult = await provider.search(question);
  if (unrelatedResult.hits.length > 0) {
    fail('GUIDE_UNRELATED_HIT', question);
  }
  process.stdout.write(`${question} | 0 | - | -\n`);
}
