import path from 'node:path';

export type AppConfig = Readonly<{
  host: string;
  port: number;
  databasePath: string;
  publicDir: string;
  modelApiKey: string;
  modelEnabled: boolean;
  requestTimeoutMs: number;
  searchProvider: 'unavailable' | 'searxng';
  searxngBaseUrl: string;
  searchTimeoutMs: number;
  searchMaxResults: number;
  disclaimer: string;
}>;

const DEFAULT_DISCLAIMER = '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别';

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv, appRoot: string): AppConfig {
  const modelApiKey = (env.TOKENDANCE_API_KEY ?? '').trim();

  return {
    host: env.HOST ?? '0.0.0.0',
    port: numberFromEnv(env.PORT, 3210),
    databasePath: path.resolve(appRoot, env.DATABASE_PATH ?? 'runtime/live-in-hdu.db'),
    publicDir: path.resolve(appRoot, 'dist/client'),
    modelApiKey,
    modelEnabled: modelApiKey.length > 0,
    requestTimeoutMs: numberFromEnv(env.REQUEST_TIMEOUT_MS, 20000),
    searchProvider: env.SEARCH_PROVIDER?.trim().toLowerCase() === 'searxng'
      ? 'searxng'
      : 'unavailable',
    searxngBaseUrl: env.SEARXNG_BASE_URL?.trim() ?? 'http://127.0.0.1:8888',
    searchTimeoutMs: numberFromEnv(env.SEARCH_TIMEOUT_MS, 10000),
    searchMaxResults: Math.min(numberFromEnv(env.SEARCH_MAX_RESULTS, 6), 6),
    disclaimer: DEFAULT_DISCLAIMER,
  };
}
