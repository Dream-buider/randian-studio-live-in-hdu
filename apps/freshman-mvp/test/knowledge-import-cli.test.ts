import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const TEST_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\tests\\knowledge-import-cli';
const APP_ROOT = path.resolve(import.meta.dirname, '..');

async function runCli(args: string[]): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/import-approved-knowledge.mts', ...args],
    {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        POSTGRES_URL: '',
        WEKNORA_API_KEY: '',
        WEKNORA_DOCUMENT_KB_ID: '',
        TMP: path.join(TEST_ROOT, 'tmp'),
        TEMP: path.join(TEST_ROOT, 'tmp'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return { code, stdout, stderr };
}

test('approved knowledge CLI requires an explicit manifest path', async () => {
  await mkdir(path.join(TEST_ROOT, 'tmp'), { recursive: true });
  const result = await runCli([]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /--manifest is required/i);
  assert.doesNotMatch(result.stderr, /POSTGRES_URL|WEKNORA_API_KEY/u);
});

test('approved knowledge CLI dry-run validates D-backed files without database or network', async () => {
  await mkdir(TEST_ROOT, { recursive: true });
  const root = await mkdtemp(path.join(TEST_ROOT, 'case-'));
  const approvedRoot = path.join(root, 'approved-knowledge');
  const manifestPath = path.join(root, 'knowledge-manifest.json');
  await mkdir(approvedRoot, { recursive: true });
  try {
    await writeFile(path.join(approvedRoot, 'guide.md'), '# approved guide\n', 'utf8');
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      items: [{
        path: 'guide.md',
        title: '新生指南',
        sourceType: 'community',
        sourceUrl: '',
        publishedAt: '2025-08-01',
        applicableYear: 2025,
        approvedBy: 'reviewer',
        approvedAt: '2026-07-28T12:00:00+08:00',
      }],
    }), 'utf8');

    const result = await runCli([
      '--manifest',
      manifestPath,
      '--approved-root',
      approvedRoot,
      '--dry-run',
    ]);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      mode: string;
      valid: boolean;
      items: Array<{ path: string; sha256: string }>;
    };
    assert.equal(output.mode, 'dry-run');
    assert.equal(output.valid, true);
    assert.equal(output.items[0].path, 'guide.md');
    assert.match(output.items[0].sha256, /^[0-9a-f]{64}$/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
