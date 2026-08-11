import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/server/config.js';

test('keeps roommate matching disabled by default', () => {
  const config = loadConfig({}, 'C:/project/apps/freshman-mvp');

  assert.equal(config.roommate?.requested, false);
  assert.equal(config.roommate?.secure, false);
});

test('marks roommate configuration secure only with HTTPS and three valid secrets', () => {
  const config = loadConfig({
    ROOMMATE_MATCHING_ENABLED: 'true',
    ROOMMATE_PUBLIC_ORIGIN: 'https://liveinhdu.cn',
    ROOMMATE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    ROOMMATE_HMAC_KEY: Buffer.alloc(32, 2).toString('base64'),
    ROOMMATE_COOKIE_SECRET: Buffer.alloc(32, 3).toString('base64'),
  }, 'C:/project/apps/freshman-mvp');

  assert.equal(config.roommate?.secure, true);
});

test('normalizes 33 and 64 byte encryption secrets to a deterministic AES-256 key', () => {
  for (const length of [33, 64]) {
    const env = {
      ROOMMATE_MATCHING_ENABLED: 'true',
      ROOMMATE_PUBLIC_ORIGIN: 'https://liveinhdu.cn',
      ROOMMATE_ENCRYPTION_KEY: Buffer.alloc(length, 1).toString('base64'),
      ROOMMATE_HMAC_KEY: Buffer.alloc(32, 2).toString('base64'),
      ROOMMATE_COOKIE_SECRET: Buffer.alloc(32, 3).toString('base64'),
    };
    const first = loadConfig(env, 'C:/project/apps/freshman-mvp');
    const second = loadConfig(env, 'C:/project/apps/freshman-mvp');

    assert.equal(first.roommate?.secure, true);
    assert.equal(first.roommate?.encryptionKey?.length, 32);
    assert.deepEqual(first.roommate?.encryptionKey, second.roommate?.encryptionKey);
  }
});

test('fails closed when an enabled roommate configuration is malformed', () => {
  const config = loadConfig({
    ROOMMATE_MATCHING_ENABLED: 'true',
    ROOMMATE_PUBLIC_ORIGIN: 'http://liveinhdu.cn',
    ROOMMATE_ENCRYPTION_KEY: 'not-base64',
    ROOMMATE_HMAC_KEY: Buffer.alloc(31, 2).toString('base64'),
    ROOMMATE_COOKIE_SECRET: Buffer.alloc(32, 3).toString('base64'),
  }, 'C:/project/apps/freshman-mvp');

  assert.equal(config.roommate?.requested, true);
  assert.equal(config.roommate?.secure, false);
});
