import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/server/config.js';

test('requires Node 24 and defaults to a local SQLite runtime', () => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24);
  const config = loadConfig({}, 'C:/project/apps/freshman-mvp');
  assert.equal(config.port, 3210);
  assert.match(config.databasePath, /runtime[\\/]live-in-hdu\.db$/);
  assert.equal(config.modelEnabled, false);
  assert.equal(config.knowledgeProvider, 'local');
  assert.equal(config.freshmanGuidePath, null);
  assert.equal(config.weknoraScoreThreshold, 0.55);
  assert.equal('modelBaseUrl' in config, false);
  assert.equal('modelId' in config, false);
  assert.equal(config.searchProvider, 'unavailable');
  assert.equal(config.searxngBaseUrl, 'http://127.0.0.1:8888');
  assert.equal(config.searchMaxResults, 6);
});

test('resolves an explicit private freshman guide path without enabling WeKnora', () => {
  const config = loadConfig({
    FRESHMAN_GUIDE_PATH: '../../approved-knowledge/hdu-freshman-guide-2026.md',
  }, 'C:/project/apps/freshman-mvp');
  assert.match(
    config.freshmanGuidePath ?? '',
    /project[\\/]approved-knowledge[\\/]hdu-freshman-guide-2026\.md$/,
  );
  assert.equal(config.knowledgeProvider, 'local');
});

test('enables WeKnora only explicitly and trims its server-only configuration', () => {
  const config = loadConfig({
    KNOWLEDGE_PROVIDER: 'weknora',
    WEKNORA_BASE_URL: ' http://127.0.0.1:8080/api/v1 ',
    WEKNORA_API_KEY: ' server-secret ',
    WEKNORA_DOCUMENT_KB_ID: ' document-kb ',
    WEKNORA_FAQ_KB_ID: ' faq-kb ',
    WEKNORA_SCORE_THRESHOLD: '0.61',
  }, 'C:/project/apps/freshman-mvp');
  assert.equal(config.knowledgeProvider, 'weknora');
  assert.equal(config.weknoraBaseUrl, 'http://127.0.0.1:8080/api/v1');
  assert.equal(config.weknoraApiKey, 'server-secret');
  assert.equal(config.weknoraDocumentKbId, 'document-kb');
  assert.equal(config.weknoraFaqKbId, 'faq-kb');
  assert.equal(config.weknoraScoreThreshold, 0.61);
});

test('enables only the explicit SearXNG search mode and caps result count', () => {
  const config = loadConfig({
    SEARCH_PROVIDER: 'searxng',
    SEARXNG_BASE_URL: 'http://127.0.0.1:9999',
    SEARCH_MAX_RESULTS: '99',
  }, 'C:/project/apps/freshman-mvp');
  assert.equal(config.searchProvider, 'searxng');
  assert.equal(config.searxngBaseUrl, 'http://127.0.0.1:9999');
  assert.equal(config.searchMaxResults, 6);
});

test('does not enable the model for a whitespace-only TokenDance key', () => {
  const config = loadConfig({ TOKENDANCE_API_KEY: '   ' }, 'C:/project/apps/freshman-mvp');
  assert.equal(config.modelApiKey, '');
  assert.equal(config.modelEnabled, false);
});
