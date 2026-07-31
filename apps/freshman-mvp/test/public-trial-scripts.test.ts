import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const START = path.join(REPO_ROOT, 'scripts', 'start-public-trial.ps1');
const STOP = path.join(REPO_ROOT, 'scripts', 'stop-public-trial.ps1');
const VERIFY = path.join(REPO_ROOT, 'scripts', 'test-public-trial.ps1');
const STOP_STACK = path.join(REPO_ROOT, 'scripts', 'stop-knowledge-stack.ps1');
const TEMP_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\temp';

function runStatic(script: string): Record<string, unknown> {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', script, '-StaticOnly'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, TEMP: TEMP_ROOT, TMP: TEMP_ROOT },
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

test('public trial scripts keep runtime on D, gateway on loopback and never mutate firewall', () => {
  const startText = readFileSync(START, 'utf8');
  const stopText = readFileSync(STOP, 'utf8');
  assert.match(startText, /127\.0\.0\.1/);
  assert.match(startText, /3211/);
  assert.match(startText, /D:\\Star\\LIVE_IN_HDU_RUNTIME/);
  assert.doesNotMatch(stopText, /down\s+-v|Remove-Item.+postgres|Remove-Item.+weknora/is);

  for (const script of [START, STOP, VERIFY]) {
    const plan = runStatic(script);
    assert.equal(plan.mode, 'static');
    assert.match(String(plan.runtimeRoot), /^D:\\/i);
    assert.equal(plan.processStarted, false);
    assert.equal(plan.firewallMutation, false);
  }
});

test('full knowledge-stack shutdown stops the public trial before the private gateway', () => {
  const contents = readFileSync(STOP_STACK, 'utf8');
  const publicStop = contents.indexOf('stop-public-trial.ps1');
  const privateStop = contents.indexOf('stop-freshman-platform.ps1');
  assert.ok(publicStop >= 0, 'public trial stop script is not integrated');
  assert.ok(privateStop >= 0, 'private platform stop script is missing');
  assert.ok(publicStop < privateStop, 'public trial must be stopped first');
});
