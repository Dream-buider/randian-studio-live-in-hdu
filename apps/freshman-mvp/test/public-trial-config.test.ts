import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { loadPublicTrialConfig } from '../src/public-trial/config.js';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const VALID_ENV: NodeJS.ProcessEnv = {
  PUBLIC_TRIAL_ACCESS_CODE: 'team-2026',
  PUBLIC_TRIAL_SESSION_SECRET: 's'.repeat(32),
};

test('public trial config requires a nonblank access code', () => {
  assert.throws(
    () => loadPublicTrialConfig({}, APP_ROOT),
    /PUBLIC_TRIAL_ACCESS_CODE/,
  );
});

test('public trial config requires a session secret with at least 32 characters', () => {
  assert.throws(
    () => loadPublicTrialConfig({
      PUBLIC_TRIAL_ACCESS_CODE: '12345678',
      PUBLIC_TRIAL_SESSION_SECRET: 'short',
    }, APP_ROOT),
    /at least 32 characters/,
  );
});

test('public trial config uses fixed loopback boundaries and a D-drive runtime', () => {
  const config = loadPublicTrialConfig(VALID_ENV, APP_ROOT);

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3211);
  assert.equal(config.upstreamOrigin, 'http://127.0.0.1:3210');
  assert.match(config.runtimeDir, /^D:\\/i);
  assert.equal(config.sessionTtlSeconds, 43_200);
  assert.equal(config.questionLimit, 30);
  assert.equal(config.questionWindowMs, 600_000);
  assert.equal(config.maxQuestionCodePoints, 500);
  assert.equal(
    config.publicDir,
    path.join(APP_ROOT, 'dist', 'public-trial-client'),
  );
});

test('public trial config rejects non-loopback overrides and non-D runtime paths', () => {
  for (const unsafe of [
    { PUBLIC_TRIAL_HOST: '0.0.0.0' },
    { PUBLIC_TRIAL_UPSTREAM: 'http://192.168.1.10:3210' },
    { PUBLIC_TRIAL_RUNTIME_DIR: 'C:\\temp\\public-trial' },
  ]) {
    assert.throws(
      () => loadPublicTrialConfig({ ...VALID_ENV, ...unsafe }, APP_ROOT),
      /loopback|D:/i,
    );
  }
});
