import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const START_SCRIPT = path.join(REPO_ROOT, 'scripts', 'start-knowledge-stack.ps1');
const STOP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'stop-knowledge-stack.ps1');
const CHECK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'test-knowledge-stack.ps1');
const BACKUP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'backup-knowledge-stack.ps1');
const PLATFORM_COMPOSE = path.join(REPO_ROOT, 'deploy', 'local', 'compose.platform.yml');
const TEMP_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\temp';
const PINNED_COMMIT = '150c07368b84b4f50421b8957255213cbbadc175';
const PWSH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';

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

function run(script: string, args: string[], environment: NodeJS.ProcessEnv = {}) {
  return spawnSync(PWSH, ['-NoProfile', '-File', script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, TEMP: TEMP_ROOT, TMP: TEMP_ROOT, ...environment },
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

test('knowledge stack prepare-only creates an idempotent minimal vendor environment without Docker', async () => {
  const root = await fixture();
  const envPath = path.join(root, 'vendor', 'WeKnora', '.env');
  try {
    const first = run(START_SCRIPT, ['-PrepareOnly', '-RepoRootOverride', root]);
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const report = JSON.parse(first.stdout);
    assert.equal(report.dockerInvoked, false);
    assert.equal(report.embeddingModelRequired, false);
    assert.equal(report.vendorEnvironment, envPath);

    const environment = await readFile(envPath, 'utf8');
    assert.match(environment, /^WEKNORA_VERSION=0\.7\.0$/m);
    assert.match(environment, /^DISABLE_REGISTRATION=false$/m);
    assert.match(environment, /^OLLAMA_BASE_URL=http:\/\/host\.docker\.internal:11434$/m);
    assert.match(environment, /^DB_PASSWORD=[a-f0-9]{64}$/m);
    assert.match(environment, /^REDIS_PASSWORD=[a-f0-9]{64}$/m);
    assert.match(environment, /^JWT_SECRET=[a-f0-9]{64}$/m);
    assert.match(environment, /^SEARXNG_SECRET=[a-f0-9]{64}$/m);
    assert.match(environment, /^LANGFUSE_PUBLIC_KEY=$/m);
    assert.match(environment, /^LANGFUSE_SECRET_KEY=$/m);

    const second = run(START_SCRIPT, ['-PrepareOnly', '-RepoRootOverride', root]);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.equal(await readFile(envPath, 'utf8'), environment);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('knowledge stack resolves Docker and Ollama from the D-drive runtime when PATH has neither tool', async () => {
  const root = await fixture();
  const runtimeRoot = path.join(root, 'runtime');
  const dockerPath = path.join(
    runtimeRoot,
    'docker',
    'DockerDesktop',
    'resources',
    'bin',
    'docker.exe',
  );
  const ollamaPath = path.join(runtimeRoot, 'ollama', 'app', 'ollama.exe');
  await mkdir(path.dirname(dockerPath), { recursive: true });
  await mkdir(path.dirname(ollamaPath), { recursive: true });
  await writeFile(dockerPath, 'fixture');
  await writeFile(ollamaPath, 'fixture');

  try {
    const resolved = run(
      START_SCRIPT,
      ['-ResolveToolsOnly', '-RepoRootOverride', root],
      {
        LIVE_IN_HDU_RUNTIME_ROOT: runtimeRoot,
        PATH: `${path.dirname(PWSH)};C:\\Windows\\System32`,
      },
    );
    assert.equal(resolved.status, 0, `${resolved.stdout}\n${resolved.stderr}`);
    const report = JSON.parse(resolved.stdout);
    assert.equal(report.dockerInvoked, false);
    assert.equal(path.normalize(report.dockerCli), path.normalize(dockerPath));
    assert.equal(path.normalize(report.ollamaCli), path.normalize(ollamaPath));
    assert.equal(report.dockerSource, 'runtime-fallback');
    assert.equal(report.ollamaSource, 'runtime-fallback');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('knowledge stack stop command never deletes volumes', () => {
  const source = run(STOP_SCRIPT, ['-PrintCommandOnly']);
  assert.equal(source.status, 0, `${source.stdout}\n${source.stderr}`);
  assert.match(source.stdout, /\bstop\b/);
  assert.doesNotMatch(source.stdout, /\bdown\b|--volumes|-v\b/i);
});

test('knowledge stack stop executes a resolved Docker CLI and retains every volume', async () => {
  const root = await fixture();
  const dockerLog = path.join(root, 'docker-calls.log');
  const fakeDocker = path.join(root, 'fake-docker.cmd');
  await writeFile(
    fakeDocker,
    [
      '@echo off',
      'echo %*>>"%LIVE_IN_HDU_DOCKER_LOG%"',
      'exit /b 0',
      '',
    ].join('\r\n'),
  );
  await writeFile(path.join(root, 'vendor', 'WeKnora', '.env'), 'WEKNORA_VERSION=0.7.0\n');
  await writeFile(
    path.join(root, 'deploy', 'local', 'compose.platform.yml'),
    'services:\n  live-in-hdu-db:\n    image: postgres:17-alpine\n',
  );
  await writeFile(
    path.join(root, 'deploy', 'local', '.env.local'),
    'LIVE_IN_HDU_DB_PASSWORD=fixture\n',
  );

  try {
    const stopped = run(
      STOP_SCRIPT,
      ['-RepoRootOverride', root],
      {
        LIVE_IN_HDU_DOCKER_CLI: fakeDocker,
        LIVE_IN_HDU_DOCKER_LOG: dockerLog,
        PATH: `${path.dirname(PWSH)};C:\\Windows\\System32`,
      },
    );
    assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
    const calls = await readFile(dockerLog, 'utf8');
    assert.match(calls, /compose .* stop .*frontend.*app.*docreader.*searxng.*redis.*postgres/i);
    assert.match(calls, /compose .* stop live-in-hdu-db/i);
    assert.doesNotMatch(calls, /\bdown\b|--volumes|-v\b/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('knowledge stack static operations expose a D-drive-only safe plan without Docker', () => {
  const check = run(CHECK_SCRIPT, ['-StaticOnly']);
  const backup = run(BACKUP_SCRIPT, ['-StaticOnly']);

  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  assert.equal(backup.status, 0, `${backup.stdout}\n${backup.stderr}`);
  const checkPlan = JSON.parse(check.stdout);
  const backupPlan = JSON.parse(backup.stdout);
  assert.equal(checkPlan.dockerInvoked, false);
  assert.deepEqual(checkPlan.startOrder, ['business-postgres', 'weknora-and-searxng', 'gateway']);
  assert.deepEqual(checkPlan.verification, [
    'backend-tests',
    'web-tests',
    'legacy-regression',
    'production-build',
    'secret-scan',
    'live-health',
  ]);
  assert.equal(backupPlan.dockerInvoked, false);
  assert.match(backupPlan.backupRoot, /^D:\\Star\\LIVE_IN_HDU_RUNTIME\\backups$/i);
  assert.match(backupPlan.manifest, /manifest\.json$/);
  assert.match(backupPlan.redactedConfig, /config\.redacted\.json$/);
  assert.deepEqual(backupPlan.artifacts, [
    'live-in-hdu.sql.gz',
    'weknora.sql.gz',
    'weknora-data-files.tar.gz',
    'approved-knowledge-manifest.json',
    'config.redacted.json',
    'manifest.json',
  ]);
  assert.equal(backupPlan.retentionCount, 14);
});

test('knowledge stack backup resolves the configured Docker CLI before touching backup data', async () => {
  const root = await fixture();
  const fakeDocker = path.join(root, 'fake-docker.cmd');
  await writeFile(fakeDocker, '@echo off\r\nexit /b 0\r\n');
  try {
    const resolved = run(
      BACKUP_SCRIPT,
      ['-ResolveToolsOnly', '-RepoRootOverride', root],
      {
        LIVE_IN_HDU_RUNTIME_ROOT: root,
        LIVE_IN_HDU_DOCKER_CLI: fakeDocker,
        PATH: `${path.dirname(PWSH)};C:\\Windows\\System32`,
      },
    );
    assert.equal(resolved.status, 0, `${resolved.stdout}\n${resolved.stderr}`);
    const report = JSON.parse(resolved.stdout);
    assert.equal(report.dockerInvoked, false);
    assert.equal(path.normalize(report.dockerCli), path.normalize(fakeDocker));
    assert.equal(report.dockerSource, 'explicit-override');
    assert.equal(path.normalize(report.backupRoot), path.normalize(path.join(root, 'backups')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('business PostgreSQL is isolated, pinned to 17, and stores its database on D', async () => {
  const compose = await import('node:fs/promises').then(({ readFile }) =>
    readFile(PLATFORM_COMPOSE, 'utf8'),
  );
  assert.match(compose, /live-in-hdu-db:/);
  assert.match(compose, /image:\s*postgres:17-alpine/);
  assert.match(compose, /\$\{LIVE_IN_HDU_DB_PASSWORD:/);
  assert.match(compose, /D:\/Star\/LIVE_IN_HDU_RUNTIME\/postgres/);
  assert.doesNotMatch(compose, /^\s{2}postgres:/m);
});
