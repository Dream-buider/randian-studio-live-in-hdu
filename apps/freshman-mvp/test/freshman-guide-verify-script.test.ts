import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const PRIVATE_BODY = 'PRIVATE-GUIDE-BODY-MUST-NOT-LEAK';
const SECRET_API_KEY = 'sk-test-secret-must-not-leak';

async function runVerifier(filePath: string): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/verify-freshman-guide.mts', '--file', filePath],
    {
      cwd: APP_ROOT,
      env: { ...process.env, TOKENDANCE_API_KEY: SECRET_API_KEY },
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

test('guide verifier reports safe hit summaries without printing private content', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'freshman-guide-verifier-'));
  const markdownPath = path.join(root, 'approved-guide.md');
  try {
    await writeFile(markdownPath, `
## 开学准备篇
### 学号班级号获取
新生可在指定入口查询学号。${PRIVATE_BODY}

### 钉钉杭州电子科技大学认证
取得学号后完成航电钉和学校钉钉认证。

## 宿舍篇
### 宿舍类型
宿舍大小和几人间以实际分配为准。

## 生活篇
### 快递收发
快递站支持收件和寄件，位于生活区北门外。

### 活力体育场
体育场包括田径场、体育馆和篮球场等运动地点。
`, 'utf8');

    const result = await runVerifier(markdownPath);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /航电钉怎么注册？ \| 1 \|/u);
    assert.match(result.stdout, /校内哪里可以修理天文望远镜？ \| 0 \| - \| -/u);
    assert.match(result.stdout, /学校体育比赛怎么报名？ \| 0 \| - \| -/u);
    assert.match(result.stdout, /快递员怎么应聘？ \| 0 \| - \| -/u);
    assert.doesNotMatch(result.stdout, new RegExp(PRIVATE_BODY, 'u'));
    assert.doesNotMatch(result.stderr, new RegExp(PRIVATE_BODY, 'u'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('guide verifier fails safely when the markdown file does not exist', async () => {
  const result = await runVerifier(path.join(tmpdir(), 'missing-approved-guide.md'));
  assert.equal(result.code, 1);
  assert.doesNotMatch(result.stderr, new RegExp(SECRET_API_KEY, 'u'));
});
