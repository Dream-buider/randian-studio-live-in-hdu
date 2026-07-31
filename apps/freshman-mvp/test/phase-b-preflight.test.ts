import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'preflight-phase-b.ps1');
const ENV_EXAMPLE = path.join(REPO_ROOT, 'deploy', 'local', '.env.example');
const GITIGNORE = path.join(REPO_ROOT, '.gitignore');
const TEMP_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\temp';
const REQUIRED_PORTS = [3210, 5433, 8080, 8888, 11434];
const PWSH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';

interface Fixture {
  wslVersion2: boolean;
  dockerCli: boolean;
  dockerEngine: boolean;
  composeV2: boolean;
  node24: boolean;
  virtualization: boolean;
  freeDiskGb: number;
  memoryGb: number;
  ollamaCli: boolean;
  ollamaServiceAvailable: boolean;
  embeddingModelAvailable: boolean;
  portsAvailable: number[];
  requestedRoot: string;
  actualRoot: string;
  fallbackReason: string;
  composeVersionText?: string;
}

function passingFixture(): Fixture {
  return {
    wslVersion2: true,
    dockerCli: true,
    dockerEngine: true,
    composeV2: true,
    node24: true,
    virtualization: true,
    freeDiskGb: 80,
    memoryGb: 32,
    ollamaCli: true,
    ollamaServiceAvailable: true,
    embeddingModelAvailable: true,
    portsAvailable: REQUIRED_PORTS,
    requestedRoot: 'D:\\',
    actualRoot: 'D:\\Star\\LIVE_IN_HDU_RUNTIME',
    fallbackReason: 'D:\\ root is not writable under the current ACL.',
  };
}

async function runFixture(fixture: Fixture) {
  await mkdir(TEMP_ROOT, { recursive: true });
  const directory = await mkdtemp(path.join(TEMP_ROOT, 'phase-b-preflight-'));
  const fixturePath = path.join(directory, 'fixture.json');
  const reportPath = path.join(directory, 'report.json');
  await writeFile(fixturePath, JSON.stringify(fixture), 'utf8');
  const result = spawnSync('pwsh', [
    '-NoProfile',
    '-File',
    SCRIPT,
    '-JsonOutput',
    reportPath,
    '-FixtureJson',
    fixturePath,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      LIVE_IN_HDU_PREFLIGHT_TEST_MODE: '1',
      TEMP: TEMP_ROOT,
      TMP: TEMP_ROOT,
    },
    timeout: 30_000,
  });
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
    ready: boolean;
    requestedRoot: string;
    actualRoot: string;
    fallbackReason: string;
    failures: Array<{ code: string; remediation: string }>;
    embeddingModel: string;
    portsAvailable: number[];
  };
  await rm(directory, { recursive: true, force: true });
  return { result, report };
}

test('Phase B preflight distinguishes a missing Docker CLI from a stopped engine', async () => {
  const missingCli = passingFixture();
  missingCli.dockerCli = false;
  missingCli.dockerEngine = false;
  missingCli.composeV2 = false;
  const missing = await runFixture(missingCli);
  assert.notEqual(missing.result.status, 0);
  assert.equal(missing.report.ready, false);
  assert.ok(missing.report.failures.some((failure) => failure.code === 'docker-cli-missing'));
  assert.ok(!missing.report.failures.some((failure) => failure.code === 'docker-engine-stopped'));

  const stoppedEngine = passingFixture();
  stoppedEngine.dockerEngine = false;
  const stopped = await runFixture(stoppedEngine);
  assert.notEqual(stopped.result.status, 0);
  assert.ok(stopped.report.failures.some((failure) => failure.code === 'docker-engine-stopped'));
  assert.ok(!stopped.report.failures.some((failure) => failure.code === 'docker-cli-missing'));
});

test('Phase B preflight emits the D-drive fallback truthfully and exits zero only when ready', async () => {
  const { result, report } = await runFixture(passingFixture());
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(report.ready, true);
  assert.equal(report.requestedRoot, 'D:\\');
  assert.equal(report.actualRoot, 'D:\\Star\\LIVE_IN_HDU_RUNTIME');
  assert.match(report.fallbackReason, /ACL|not writable/i);
  assert.equal(report.embeddingModel, 'nomic-embed-text:latest');
  assert.deepEqual(report.portsAvailable, REQUIRED_PORTS);
  assert.deepEqual(report.failures, []);
});

test('Phase B preflight accepts port 11434 when the expected Ollama model is already serving', async () => {
  const fixture = passingFixture();
  fixture.portsAvailable = fixture.portsAvailable.filter((port) => port !== 11434);
  const { result, report } = await runFixture(fixture);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(report.ready, true);
  assert.deepEqual(report.failures, []);
});

test('Phase B preflight treats a running Ollama port as expected while its model is still missing', async () => {
  const fixture = passingFixture();
  fixture.embeddingModelAvailable = false;
  fixture.portsAvailable = fixture.portsAvailable.filter((port) => port !== 11434);
  const { result, report } = await runFixture(fixture);
  assert.notEqual(result.status, 0);
  const modelFailure = report.failures.find(
    (failure) => failure.code === 'embedding-model-missing',
  );
  assert.ok(modelFailure);
  assert.ok(!report.failures.some((failure) => failure.code === 'ports-in-use'));
  assert.match(modelFailure.remediation, /nomic-embed-text:latest/);
  assert.doesNotMatch(modelFailure.remediation, /\$EmbeddingModel/);
});

test('Phase B preflight accepts integrated Docker Compose major versions newer than v2', async () => {
  const fixture = passingFixture();
  fixture.composeV2 = false;
  fixture.composeVersionText = 'v5.3.1';
  const { result, report } = await runFixture(fixture);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(report.ready, true);
  assert.ok(!report.failures.some((failure) => failure.code === 'compose-v2-unavailable'));
});

test('Phase B preflight finds D-drive runtime CLIs even when neither tool is on PATH', async () => {
  const directory = await mkdtemp(path.join(TEMP_ROOT, 'phase-b-runtime-tools-'));
  const dockerPath = path.join(
    directory,
    'docker',
    'DockerDesktop',
    'resources',
    'bin',
    'docker.exe',
  );
  const ollamaPath = path.join(directory, 'ollama', 'app', 'ollama.exe');
  const reportPath = path.join(directory, 'report.json');
  await mkdir(path.dirname(dockerPath), { recursive: true });
  await mkdir(path.dirname(ollamaPath), { recursive: true });
  await writeFile(dockerPath, 'not a real executable');
  await writeFile(ollamaPath, 'not a real executable');

  try {
    const result = spawnSync(PWSH, [
      '-NoProfile',
      '-File',
      SCRIPT,
      '-JsonOutput',
      reportPath,
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        LIVE_IN_HDU_RUNTIME_ROOT: directory,
        PATH: `${path.dirname(PWSH)};C:\\Windows\\System32`,
        TEMP: TEMP_ROOT,
        TMP: TEMP_ROOT,
      },
      timeout: 30_000,
    });
    assert.notEqual(result.status, null, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
      dockerCli: boolean;
      ollamaCli: boolean;
      failures: Array<{ code: string }>;
    };
    assert.equal(report.dockerCli, true);
    assert.equal(report.ollamaCli, true);
    assert.ok(!report.failures.some((failure) => failure.code === 'docker-cli-missing'));
    assert.ok(!report.failures.some((failure) => failure.code === 'ollama-cli-missing'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Phase B prerequisite boundary keeps secrets blank and large runtime paths on D', async () => {
  const [script, environment, gitignore] = await Promise.all([
    readFile(SCRIPT, 'utf8'),
    readFile(ENV_EXAMPLE, 'utf8'),
    readFile(GITIGNORE, 'utf8'),
  ]);
  assert.doesNotMatch(script, /\b(?:winget|choco|docker\s+pull|ollama\s+pull)\b/i);
  for (const secretName of [
    'LIVE_IN_HDU_DB_PASSWORD',
    'WEKNORA_API_KEY',
    'SEARXNG_SECRET',
  ]) {
    assert.match(environment, new RegExp(`^${secretName}=$`, 'm'));
  }
  for (const pathName of [
    'LIVE_IN_HDU_RUNTIME_ROOT',
    'POSTGRES_DATA_DIR',
    'WEKNORA_DATA_DIR',
    'SEARXNG_DATA_DIR',
    'OLLAMA_MODELS',
  ]) {
    assert.match(
      environment,
      new RegExp(`^${pathName}=D:/Star/LIVE_IN_HDU_RUNTIME(?:/.*)?$`, 'm'),
    );
  }
  for (const [pathName, expectedPath] of Object.entries({
    POSTGRES_DATA_DIR: 'D:/Star/LIVE_IN_HDU_RUNTIME/postgres',
    WEKNORA_DATA_DIR: 'D:/Star/LIVE_IN_HDU_RUNTIME/weknora',
    SEARXNG_DATA_DIR: 'D:/Star/LIVE_IN_HDU_RUNTIME/searxng',
    OLLAMA_MODELS: 'D:/Star/LIVE_IN_HDU_RUNTIME/ollama/models',
  })) {
    assert.match(environment, new RegExp(`^${pathName}=${expectedPath}$`, 'm'));
  }
  assert.match(gitignore, /^deploy\/local\/\.env\.local$/m);
  assert.match(gitignore, /^vendor\/WeKnora\/\.env$/m);
  assert.match(gitignore, /^output\/freshman-platform\/approved-knowledge\/$/m);
  assert.match(gitignore, /^output\/freshman-platform\/knowledge-manifest\.json$/m);
  assert.match(gitignore, /^output\/freshman-platform\/backups\/$/m);
});
