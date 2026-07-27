import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/server/config.js';

test('requires Node 24 and defaults to a local SQLite runtime', () => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24);
  const config = loadConfig({}, 'C:/project/apps/freshman-mvp');
  assert.equal(config.port, 3210);
  assert.match(config.databasePath, /runtime[\\/]live-in-hdu\.db$/);
  assert.equal(config.modelEnabled, false);
  assert.equal('modelBaseUrl' in config, false);
  assert.equal('modelId' in config, false);
});

test('does not enable the model for a whitespace-only TokenDance key', () => {
  const config = loadConfig({ TOKENDANCE_API_KEY: '   ' }, 'C:/project/apps/freshman-mvp');
  assert.equal(config.modelApiKey, '');
  assert.equal(config.modelEnabled, false);
});
