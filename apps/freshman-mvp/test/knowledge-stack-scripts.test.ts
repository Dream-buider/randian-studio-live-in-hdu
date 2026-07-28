import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const START_SCRIPT = path.join(REPO_ROOT, 'scripts', 'start-knowledge-stack.ps1');
const STOP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'stop-knowledge-stack.ps1');
const CHECK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'test-knowledge-stack.ps1');
const BACKUP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'backup-knowledge-stack.ps1');
const TEMP_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\temp';
const PINNED_COMMIT = '150c07368b84b4f50421b8957255213cbbadc175';

async function fixture(version = '0.7.0'): Promise<string> {
  const root = await mkdtemp(path.join(TEMP_ROOT, 'weknora-lifecycle-'));
  await mkdir(path.join(root, 'vendor', 'WeKnora'), { recursive: true });
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, 'deploy', 'local'), { recursive: true });
  await writeFile(path.join(root, 'vendor', 'WeKnora', 'VERSION'), version);
  await writeFile(path.join(root, 'vendor', 'WeKnora', 'LICENSE'), 'MIT fixture');
  await writeFile(
    path.join(root, 'vendor', 'WeKnora', 'docker-compose.yml'),
    'services:\n  app:\n    image: wechatopenai/weknora-app:${WEKNORA_VERSION:-latest}\n',
  );
  await writeFile(
    path.join(root, 'docs', 'WEKNORA_UPSTREAM_BASELINE.md'),
    `固定提交：${PINNED_COMMIT}\n`,
  );
  await writeFile(
    path.join(root, 'deploy', 'local', 'compose.weknora.override.yml'),
    [
      'services:',
      '  app:',
      '    ports: !override',
      '      - "127.0.0.1:${APP_PORT:-8080}:8080"',
      '  frontend:',
      '    ports: !override',
      '      - "127.0.0.1:${FRONTEND_PORT:-8081}:80"',
      '',
    ].join('\n'),
  );
  return root;
}

function run(script: string, args: string[]) {
  return spawnSync('pwsh', ['-NoProfile', '-File', script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, TEMP: TEMP_ROOT, TMP: TEMP_ROOT },
  });
}

test('knowledge stack validation accepts only the pinned vendor baseline and loopback override', async () => {
  const good = await fixture();
  const bad = await fixture('latest');
  try {
    const accepted = run(START_SCRIPT, ['-ValidateOnly', '-RepoRootOverride', good]);
    assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
    const report = JSON.parse(accepted.stdout);
    assert.equal(report.vendorVersion, '0.7.0');
    assert.equal(report.pinnedCommit, PINNED_COMMIT);
    assert.equal(report.loopbackOverride, true);
    assert.equal(report.dockerInvoked, false);

    const rejected = run(START_SCRIPT, ['-ValidateOnly', '-RepoRootOverride', bad]);
    assert.notEqual(rejected.status, 0);
    assert.match(`${rejected.stdout}\n${rejected.stderr}`, /0\.7\.0|pinned|version/i);
  } finally {
    await rm(good, { recursive: true, force: true });
    await rm(bad, { recursive: true, force: true });
  }
});

test('knowledge stack stop command never deletes volumes', () => {
  const source = run(STOP_SCRIPT, ['-PrintCommandOnly']);
  assert.equal(source.status, 0, `${source.stdout}\n${source.stderr}`);
  assert.match(source.stdout, /\bstop\b/);
  assert.doesNotMatch(source.stdout, /\bdown\b|--volumes|-v\b/i);
});

test('knowledge stack static operations expose a D-drive-only safe plan without Docker', () => {
  const check = run(CHECK_SCRIPT, ['-StaticOnly']);
  const backup = run(BACKUP_SCRIPT, ['-StaticOnly']);

  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  assert.equal(backup.status, 0, `${backup.stdout}\n${backup.stderr}`);
  const checkPlan = JSON.parse(check.stdout);
  const backupPlan = JSON.parse(backup.stdout);
  assert.equal(checkPlan.dockerInvoked, false);
  assert.deepEqual(checkPlan.startOrder, ['postgres', 'weknora-and-searxng', 'gateway']);
  assert.equal(backupPlan.dockerInvoked, false);
  assert.match(backupPlan.backupRoot, /^D:\\Star\\LIVE_IN_HDU_RUNTIME\\backups$/i);
  assert.match(backupPlan.manifest, /manifest\.json$/);
  assert.match(backupPlan.redactedConfig, /config\.redacted\.json$/);
});
