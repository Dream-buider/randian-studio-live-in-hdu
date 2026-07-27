import { join } from 'node:path';

export const DEFAULT_DISCLAIMER =
  '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别';

function numberFrom(env, key, fallback) {
  const value = Number(env[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function loadConfig(env = process.env, rootDir = process.cwd()) {
  const deepseekApiKey = String(env.DEEPSEEK_API_KEY || '').trim();
  return Object.freeze({
    rootDir,
    host: String(env.HOST || '0.0.0.0'),
    port: numberFrom(env, 'PORT', 3210),
    presetThreshold: numberFrom(env, 'PRESET_THRESHOLD', 0.52),
    knowledgeThreshold: numberFrom(env, 'KNOWLEDGE_THRESHOLD', 0.38),
    intentConfidence: numberFrom(env, 'INTENT_CONFIDENCE', 0.78),
    requestTimeoutMs: numberFrom(env, 'REQUEST_TIMEOUT_MS', 20_000),
    disclaimer: String(env.REVIEW_DISCLAIMER || DEFAULT_DISCLAIMER),
    deepseekApiKey,
    deepseekBaseUrl: String(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'),
    deepseekModel: String(env.DEEPSEEK_MODEL || 'deepseek-v4-flash'),
    webSearchEndpoint: String(env.WEB_SEARCH_ENDPOINT || '').trim(),
    webSearchApiKey: String(env.WEB_SEARCH_API_KEY || '').trim(),
    demoMode: deepseekApiKey.length === 0,
    dataDir: String(env.DATA_DIR || join(rootDir, 'data')),
    publicDir: String(env.PUBLIC_DIR || join(rootDir, 'public')),
  });
}
