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
const RESTORE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'restore-business-postgres-drill.ps1');
const RUNTIME_TOOLING = path.join(REPO_ROOT, 'scripts', 'runtime-tooling.ps1');
const PREPARE_WEKNORA_SOURCE = path.join(
  REPO_ROOT,
  'scripts',
  'prepare-weknora-source.ps1',
);
const SET_LOCAL_ENV_VALUE = path.join(
  REPO_ROOT,
  'scripts',
  'set-local-env-value.ps1',
);
const PLATFORM_COMPOSE = path.join(REPO_ROOT, 'deploy', 'local', 'compose.platform.yml');
const WEKNORA_OVERRIDE_COMPOSE = path.join(
  REPO_ROOT,
  'deploy',
  'local',
  'compose.weknora.override.yml',
);
const WEKNORA_RUNTIME_DOCKERFILE = path.join(
  REPO_ROOT,
  'deploy',
  'local',
  'Dockerfile.weknora-app-runtime',
);
const WEKNORA_DOCREADER_BUILDER_DOCKERFILE = path.join(
  REPO_ROOT,
  'deploy',
  'local',
  'Dockerfile.weknora-docreader-builder',
);
const WEKNORA_DOCREADER_RUNTIME_DOCKERFILE = path.join(
  REPO_ROOT,
  'deploy',
  'local',
  'Dockerfile.weknora-docreader-runtime',
);
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

function runCommand(command: string) {
  return spawnSync(PWSH, ['-NoProfile', '-Command', command], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, TEMP: TEMP_ROOT, TMP: TEMP_ROOT },
  });
}

test('local env updater replaces one key atomically without echoing its value', async () => {
  const root = await mkdtemp(path.join(TEMP_ROOT, 'local-env-'));
  const envPath = path.join(root, '.env.local');
  try {
    await writeFile(envPath, 'FIRST=keep\nTARGET=old\nLAST=keep-too\n');
    const result = run(SET_LOCAL_ENV_VALUE, [
      '-EnvFile', envPath,
      '-Name', 'TARGET',
      '-Value', 'sk-test-secret',
    ]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /sk-test-secret/);
    assert.equal(
      await readFile(envPath, 'utf8'),
      'FIRST=keep\nTARGET=sk-test-secret\nLAST=keep-too\n',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('WeKnora source preparation adds an idempotent DuckDB 1.5.2 proxy bridge', async () => {
  const root = await mkdtemp(path.join(TEMP_ROOT, 'weknora-source-'));
  const sourcePath = path.join(root, 'cmd', 'download', 'duckdb', 'duckdb.go');
  const dockerfilePath = path.join(root, 'docker', 'Dockerfile.app');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await mkdir(path.dirname(dockerfilePath), { recursive: true });
  await writeFile(
    sourcePath,
    [
      'package main',
      '',
      'import (',
      '\t"context"',
      '\t"database/sql"',
      '\t"fmt"',
      '',
      '\t_ "github.com/duckdb/duckdb-go/v2"',
      ')',
      '',
      'func downloadExtensions() {',
      '\tctx := context.Background()',
      '',
      '\tsqlDB, err := sql.Open("duckdb", ":memory:")',
      '\tif err != nil {',
      '\t\tpanic(err)',
      '\t}',
      '\tdefer sqlDB.Close()',
      '',
      '\tfor _, ext := range duckdbExtensions {',
      '\t\tif _, err := sqlDB.ExecContext(ctx, fmt.Sprintf("INSTALL %s;", ext)); err != nil {',
      '\t\t\tpanic(fmt.Errorf("failed to install %s extension: %w", ext, err))',
      '\t\t}',
      '\t}',
      '}',
      '',
    ].join('\n'),
  );
  await writeFile(
    dockerfilePath,
    [
      'FROM debian:12.12-slim',
      'RUN apt-get update && \\',
      '    apt-get install -y curl && \\',
      '    python3 -m pip install --break-system-packages --upgrade pip setuptools wheel && \\',
      '    mkdir -p /home/appuser/.local/bin && \\',
      '    curl -LsSf https://astral.sh/uv/install.sh | CARGO_HOME=/home/appuser/.cargo UV_INSTALL_DIR=/home/appuser/.local/bin sh && \\',
      '    chown -R appuser:appuser /home/appuser && \\',
      '    ln -sf /home/appuser/.local/bin/uvx /usr/local/bin/uvx && \\',
      '    chmod +x /usr/local/bin/uvx && \\',
      '    apt-get clean && \\',
      '    rm -rf /var/lib/apt/lists/*',
      '',
    ].join('\n'),
  );

  try {
    const first = run(PREPARE_WEKNORA_SOURCE, ['-VendorRoot', root]);
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const patched = await readFile(sourcePath, 'utf8');
    assert.match(patched, /"os"/);
    assert.match(patched, /os\.LookupEnv\("HTTP_PROXY"\)/);
    assert.match(patched, /SET http_proxy = \?/);
    assert.doesNotMatch(patched, /custom_extension_repository/);
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    assert.match(dockerfile, /Acquire::Retries=10/);
    assert.match(dockerfile, /Acquire::http::Pipeline-Depth=0/);
    assert.match(
      dockerfile,
      /rm -rf \/var\/lib\/apt\/lists\/\*\n\nRUN mkdir -p \/home\/appuser\/\.local\/bin/,
    );
    assert.match(dockerfile, /for attempt in 1 2 3 4 5/);
    assert.match(first.stdout, /patched/i);

    const second = run(PREPARE_WEKNORA_SOURCE, ['-VendorRoot', root]);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.equal(await readFile(sourcePath, 'utf8'), patched);
    assert.equal(await readFile(dockerfilePath, 'utf8'), dockerfile);
    assert.match(second.stdout, /already-patched/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Docker storage validation accepts the current CustomWslDistroDir setting on D', async () => {
  const root = await mkdtemp(path.join(TEMP_ROOT, 'docker-storage-'));
  const dockerRoot = path.join(root, 'docker');
  const wslRoot = path.join(dockerRoot, 'wsl');
  const settingsPath = path.join(root, 'settings-store.json');
  await mkdir(wslRoot, { recursive: true });
  await writeFile(settingsPath, JSON.stringify({ CustomWslDistroDir: wslRoot }));

  try {
    const escapedTooling = RUNTIME_TOOLING.replaceAll("'", "''");
    const escapedRoot = root.replaceAll("'", "''");
    const escapedSettings = settingsPath.replaceAll("'", "''");
    const result = runCommand(
      `. '${escapedTooling}'; `
      + `Assert-LiveInHduDockerDiskImageOnD -RuntimeRoot '${escapedRoot}' `
      + `-SettingsFiles @('${escapedSettings}')`,
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
      'where docker-credential-desktop >nul 2>nul || exit /b 91',
      'echo %*>>"%LIVE_IN_HDU_DOCKER_LOG%"',
      'exit /b 0',
      '',
    ].join('\r\n'),
  );
  await writeFile(
    path.join(root, 'docker-credential-desktop.cmd'),
    '@echo off\r\nexit /b 0\r\n',
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

test('business-only backup and restore drill expose an isolated D-drive plan', () => {
  const backup = run(BACKUP_SCRIPT, ['-StaticOnly', '-BusinessOnly']);
  const restore = run(RESTORE_SCRIPT, ['-StaticOnly']);

  assert.equal(backup.status, 0, `${backup.stdout}\n${backup.stderr}`);
  assert.equal(restore.status, 0, `${restore.stdout}\n${restore.stderr}`);

  const backupPlan = JSON.parse(backup.stdout);
  assert.equal(backupPlan.mode, 'business-only');
  assert.equal(backupPlan.requiresWeKnora, false);
  assert.deepEqual(backupPlan.artifacts, [
    'live-in-hdu.sql.gz',
    'config.redacted.json',
    'manifest.json',
  ]);

  const restorePlan = JSON.parse(restore.stdout);
  assert.equal(restorePlan.dockerInvoked, false);
  assert.equal(restorePlan.sourceManifestVerified, true);
  assert.equal(restorePlan.productionDataModified, false);
  assert.equal(restorePlan.containerRemovedAfterVerification, true);
  assert.equal(restorePlan.databaseOwnerFromManifest, true);
  assert.equal(restorePlan.waitsForFinalPostgresStartup, true);
  assert.equal(restorePlan.testPort, 55433);
  assert.match(
    restorePlan.restoreRoot,
    /^D:\\Star\\LIVE_IN_HDU_RUNTIME\\restore-drills$/i,
  );
  assert.match(restorePlan.projectPrefix, /^live-in-hdu-restore-/);
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

test('WeKnora runtime image reuses the pinned successful builder and isolates flaky downloads', async () => {
  const dockerfile = await readFile(WEKNORA_RUNTIME_DOCKERFILE, 'utf8');
  assert.match(dockerfile, /^FROM live-in-hdu\/weknora-builder:0\.7\.0 AS builder$/m);
  assert.match(dockerfile, /^FROM node:20-slim AS node_runtime$/m);
  assert.match(dockerfile, /^FROM debian:12\.12-slim$/m);
  assert.match(dockerfile, /Acquire::Retries=10/);
  assert.match(dockerfile, /for attempt in 1 2 3 4 5/);
  assert.match(dockerfile, /COPY --from=builder \/app\/WeKnora \./);
  assert.match(dockerfile, /COPY --from=node_runtime \/usr\/local \/usr\/local/);
  assert.doesNotMatch(dockerfile, /^\s*nodejs npm/m);
  assert.ok((dockerfile.match(/apt-get .* install/g) ?? []).length >= 4);
});

test('WeKnora docreader build is split into pinned, retryable builder and runtime images', async () => {
  const [builder, runtime] = await Promise.all([
    readFile(WEKNORA_DOCREADER_BUILDER_DOCKERFILE, 'utf8'),
    readFile(WEKNORA_DOCREADER_RUNTIME_DOCKERFILE, 'utf8'),
  ]);
  assert.match(builder, /^FROM python:3\.10\.18-bookworm$/m);
  assert.match(builder, /Acquire::Retries=10/);
  assert.match(builder, /python -m uv sync --locked --no-dev/);
  assert.match(runtime, /^FROM live-in-hdu\/weknora-docreader-builder:0\.7\.0 AS builder$/m);
  assert.match(runtime, /^FROM python:3\.10\.18-bookworm$/m);
  assert.match(runtime, /for attempt in 1 2 3 4 5/);
  assert.ok((runtime.match(/apt-get .* install/g) ?? []).length >= 3);
  assert.match(runtime, /python -m playwright install webkit/);
  assert.match(runtime, /dependencies_installed=false/);
});

test('WeKnora compose uses the verified local runtime images without upstream rebuild paths', async () => {
  const compose = await readFile(WEKNORA_OVERRIDE_COMPOSE, 'utf8');
  assert.match(compose, /Dockerfile\.weknora-app-runtime/);
  assert.match(compose, /Dockerfile\.weknora-docreader-runtime/);
  assert.match(compose, /SSRF_WHITELIST_EXTRA:\s*tokendance\.space/);
});
