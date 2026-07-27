import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import { importWorkbook } from '../src/services/content-importer.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const APP_ROOT = path.join(REPO_ROOT, 'apps', 'freshman-mvp');
const START_SCRIPT = path.join(REPO_ROOT, 'scripts', 'start-freshman-platform.ps1');
const STOP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'stop-freshman-platform.ps1');
const TEST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'test-freshman-platform.ps1');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'output', 'freshman-platform');
const BROWSER_OUTPUT = path.join(REPO_ROOT, 'output', 'playwright', 'runtime');
const TEMP_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\temp';
const WORKBOOK = path.join(REPO_ROOT, 'output', 'playwright', 'current-40q-2026-07-27.xlsx');

function runPowerShell(script: string, args: string[] = []) {
  mkdirSync(TEMP_ROOT, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stdoutPath = path.join(TEMP_ROOT, `pwsh-${token}.stdout.log`);
  const stderrPath = path.join(TEMP_ROOT, `pwsh-${token}.stderr.log`);
  const stdoutFd = openSync(stdoutPath, 'w');
  const stderrFd = openSync(stderrPath, 'w');
  try {
    const result = spawnSync('pwsh', ['-NoProfile', '-File', script, ...args], {
      cwd: REPO_ROOT,
      windowsHide: true,
      env: {
        ...process.env,
        TEMP: TEMP_ROOT,
        TMP: TEMP_ROOT,
        npm_config_cache: 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\npm-cache',
      },
      stdio: ['ignore', stdoutFd, stderrFd],
      timeout: 120_000,
    });
    return {
      ...result,
      stdout: readFileSync(stdoutPath, 'utf8'),
      stderr: readFileSync(stderrPath, 'utf8'),
    };
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
    rmSync(stdoutPath, { force: true });
    rmSync(stderrPath, { force: true });
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('lifecycle ownership rejects forged metadata and never accepts or stops a foreign Node process', {
  timeout: 120_000,
}, async () => {
  const instance = `ownership-${process.pid}`;
  const instanceOutput = path.join(OUTPUT_ROOT, instance);
  await mkdir(instanceOutput, { recursive: true });
  const foreign = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)', 'dist/server/index.js'],
    { windowsHide: true, stdio: 'ignore' },
  );
  assert.ok(foreign.pid);
  await delay(250);
  const expectedAppRoot = APP_ROOT;
  const expectedEntrypoint = path.join(APP_ROOT, 'dist', 'server', 'index.js');
  await writeFile(path.join(instanceOutput, 'platform.pid.json'), JSON.stringify({
    pid: foreign.pid,
    appRoot: expectedAppRoot,
    entrypoint: expectedEntrypoint,
    database: path.join(TEMP_ROOT, 'ownership-unused.db'),
    port: 33991,
  }));

  try {
    const start = runPowerShell(START_SCRIPT, [
      '-InstanceName', instance,
      '-DatabasePathOverride', path.join(TEMP_ROOT, 'ownership-unused.db'),
      '-PortOverride', '33991',
    ]);
    const stop = runPowerShell(STOP_SCRIPT, ['-InstanceName', instance]);
    assert.notEqual(start.status, 0, `${start.stdout}\n${start.stderr}`);
    assert.notEqual(stop.status, 0, `${stop.stdout}\n${stop.stderr}`);
    assert.equal(processAlive(foreign.pid!), true);
  } finally {
    if (processAlive(foreign.pid!)) {
      foreign.kill();
    }
    await rm(instanceOutput, { recursive: true, force: true });
  }
});

test('start rejects a suspicious partial bootstrap database but real start and stop still work', {
  timeout: 120_000,
}, async () => {
  await mkdir(TEMP_ROOT, { recursive: true });
  const directory = await mkdtemp(path.join(TEMP_ROOT, 'lifecycle-state-'));
  const partialDatabase = path.join(directory, 'partial.db');
  const validDatabase = path.join(directory, 'valid.db');
  const partialInstance = `partial-${process.pid}`;
  const validInstance = `valid-${process.pid}`;
  const partial = openDatabase(partialDatabase);
  migrateDatabase(partial);
  const partialContent = new SqliteContentRepository(partial);
  await partialContent.createIntent({
    id: 'only-one',
    externalId: 'Q01',
    category: '残缺数据',
    question: '这是残缺数据库吗？',
    intentDescription: '故意只写入一个意图。',
    aliases: [],
    keywords: [],
    excludeKeywords: [],
    active: true,
    featured: false,
    displayOrder: 1,
  });
  partial.close();

  const valid = openDatabase(validDatabase);
  migrateDatabase(valid);
  const validContent = new SqliteContentRepository(valid);
  await importWorkbook(WORKBOOK, validContent);
  valid.close();

  try {
    const rejected = runPowerShell(START_SCRIPT, [
      '-InstanceName', partialInstance,
      '-DatabasePathOverride', partialDatabase,
      '-PortOverride', '33992',
    ]);
    assert.notEqual(rejected.status, 0, `${rejected.stdout}\n${rejected.stderr}`);
    assert.match(`${rejected.stdout}\n${rejected.stderr}`, /partial|baseline|残缺|suspicious/i);

    const started = runPowerShell(START_SCRIPT, [
      '-InstanceName', validInstance,
      '-DatabasePathOverride', validDatabase,
      '-PortOverride', '33993',
    ]);
    assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
    const alreadyRunning = runPowerShell(START_SCRIPT, [
      '-InstanceName', validInstance,
      '-DatabasePathOverride', validDatabase,
    ]);
    assert.equal(alreadyRunning.status, 0, `${alreadyRunning.stdout}\n${alreadyRunning.stderr}`);
    assert.match(alreadyRunning.stdout, /localhost:33993/);
    assert.doesNotMatch(alreadyRunning.stdout, /localhost:3210/);
    const conflictingPort = runPowerShell(START_SCRIPT, [
      '-InstanceName', validInstance,
      '-DatabasePathOverride', validDatabase,
      '-PortOverride', '33994',
    ]);
    assert.notEqual(conflictingPort.status, 0, `${conflictingPort.stdout}\n${conflictingPort.stderr}`);
    assert.match(`${conflictingPort.stdout}\n${conflictingPort.stderr}`, /conflict|33993/i);
    const stopped = runPowerShell(STOP_SCRIPT, ['-InstanceName', validInstance]);
    assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
  } finally {
    runPowerShell(STOP_SCRIPT, ['-InstanceName', partialInstance]);
    runPowerShell(STOP_SCRIPT, ['-InstanceName', validInstance]);
    await rm(path.join(OUTPUT_ROOT, partialInstance), { recursive: true, force: true });
    await rm(path.join(OUTPUT_ROOT, validInstance), { recursive: true, force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test('secret scan includes D-backed Playwright runtime artifacts', {
  timeout: 120_000,
}, async () => {
  const clean = runPowerShell(TEST_SCRIPT, ['-SecretScanOnly']);
  assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`);
  const fixture = path.join(BROWSER_OUTPUT, `secret-negative-${process.pid}.log`);
  await writeFile(
    fixture,
    `TOKENDANCE_${'API_KEY'}=${'z'.repeat(32)}`,
    'utf8',
  );
  try {
    const result = runPowerShell(TEST_SCRIPT, ['-SecretScanOnly']);
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /credential|secret/i);
  } finally {
    await rm(fixture, { force: true });
  }
});
