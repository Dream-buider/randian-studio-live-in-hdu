import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/server/config.js';
import * as runtimeModule from '../src/server/index.js';

const { createProductionRuntime } = runtimeModule;

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function secureRoommateEnv(databasePath: string, encryptionKeyLength = 32): NodeJS.ProcessEnv {
  return {
    DATABASE_PATH: databasePath,
    ROOMMATE_MATCHING_ENABLED: 'true',
    ROOMMATE_PUBLIC_ORIGIN: 'https://liveinhdu.cn',
    ROOMMATE_ENCRYPTION_KEY: Buffer.alloc(encryptionKeyLength, 1).toString('base64'),
    ROOMMATE_HMAC_KEY: Buffer.alloc(32, 2).toString('base64'),
    ROOMMATE_COOKIE_SECRET: Buffer.alloc(32, 3).toString('base64'),
  };
}

test('reports PostgreSQL roommate matching as a configuration error', () => {
  const statusFor = (runtimeModule as unknown as {
    roommateMatchingStatus?: (config: ReturnType<typeof loadConfig>) => string;
  }).roommateMatchingStatus;
  assert.equal(typeof statusFor, 'function');
  assert.equal(statusFor?.(loadConfig({
    ...secureRoommateEnv('C:/runtime/live-in-hdu.db'),
    DATABASE_PROVIDER: 'postgres',
  }, appRoot)), 'configuration-error');
});

test('disabled and malformed roommate settings preserve Q&A and report no secrets', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-roommate-runtime-'));
  try {
    for (const env of [
      { DATABASE_PATH: path.join(directory, 'disabled.db') },
      {
        DATABASE_PATH: path.join(directory, 'malformed.db'),
        ROOMMATE_MATCHING_ENABLED: 'true',
        ROOMMATE_PUBLIC_ORIGIN: 'http://liveinhdu.cn',
        ROOMMATE_ENCRYPTION_KEY: 'invalid-secret',
      },
    ]) {
      const runtime = await createProductionRuntime({ appRoot, env, runtimePlatform: 'linux' });
      try {
        const questions = await runtime.app.inject({ method: 'GET', url: '/api/questions' });
        assert.equal(questions.statusCode, 200);
        assert.deepEqual(questions.json(), { items: [] });

        const health = (await runtime.app.inject({ method: 'GET', url: '/api/health' })).json();
        assert.equal(
          health.components.roommateMatching.status,
          env.ROOMMATE_MATCHING_ENABLED === 'true' ? 'configuration-error' : 'disabled',
        );
        assert.equal(JSON.stringify(health).includes('invalid-secret'), false);
      } finally {
        await runtime.close();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('secure SQLite roommate runtime migrates, unrefs retention, and closes storage once', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-roommate-runtime-'));
  const databasePath = path.join(directory, 'roommates.db');
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let unrefCalls = 0;
  let clearedCalls = 0;
  const retentionTimer = {
    unref: () => { unrefCalls += 1; },
  } as unknown as NodeJS.Timeout;
  try {
    globalThis.setInterval = ((callback: TimerHandler, delay?: number) => {
      assert.equal(delay, 60 * 60 * 1000);
      void callback;
      return retentionTimer;
    }) as typeof setInterval;
    globalThis.clearInterval = ((timer?: NodeJS.Timeout) => {
      assert.equal(timer, retentionTimer);
      clearedCalls += 1;
    }) as typeof clearInterval;

    const runtime = await createProductionRuntime({
      appRoot,
      env: secureRoommateEnv(databasePath),
      runtimePlatform: 'linux',
    });
    const database = runtime.database;
    assert.ok(database);
    const originalClose = database.close.bind(database);
    let closeCalls = 0;
    Object.defineProperty(database, 'close', {
      value: () => {
        closeCalls += 1;
        originalClose();
      },
    });
    try {
      const health = (await runtime.app.inject({ method: 'GET', url: '/api/health' })).json();
      assert.equal(health.components.roommateMatching.status, 'available');
      assert.equal(unrefCalls, 1);
      assert.deepEqual(
        database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'roommate_%' ORDER BY name")
          .all()
          .map((row) => (row as { name: string }).name),
        ['roommate_admin_audit', 'roommate_building_groups', 'roommate_registration_contacts', 'roommate_registrations', 'roommate_sessions'],
      );

      await runtime.close();
      await runtime.close();
      assert.equal(clearedCalls, 1);
      assert.equal(closeCalls, 1);
    } finally {
      await runtime.close();
    }
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    await rm(directory, { recursive: true, force: true });
  }
});

test('secure SQLite roommate runtime starts with 33 and 64 byte encryption secrets', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-roommate-long-key-'));
  try {
    for (const length of [33, 64]) {
      const runtime = await createProductionRuntime({
        appRoot,
        env: secureRoommateEnv(path.join(directory, `${length}.db`), length),
        runtimePlatform: 'linux',
      });
      try {
        const health = (await runtime.app.inject({ method: 'GET', url: '/api/health' })).json();
        assert.equal(health.components.roommateMatching.status, 'available');
      } finally {
        await runtime.close();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('roommate retention timer is cleared when startup fails after it is created', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-roommate-startup-failure-'));
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let unrefCalls = 0;
  let clearedCalls = 0;
  const retentionTimer = {
    unref: () => { unrefCalls += 1; },
  } as unknown as NodeJS.Timeout;
  try {
    globalThis.setInterval = (() => retentionTimer) as typeof setInterval;
    globalThis.clearInterval = ((timer?: NodeJS.Timeout) => {
      assert.equal(timer, retentionTimer);
      clearedCalls += 1;
    }) as typeof clearInterval;

    await assert.rejects(
      () => createProductionRuntime({
        appRoot: directory,
        env: secureRoommateEnv(path.join(directory, 'roommates.db')),
        runtimePlatform: 'linux',
      }),
    );
    assert.equal(unrefCalls, 1);
    assert.equal(clearedCalls, 1);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    await rm(directory, { recursive: true, force: true });
  }
});
