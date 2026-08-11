import path from 'node:path';
import { createHash } from 'node:crypto';

export type RoommateConfig = Readonly<{
  requested: boolean;
  publicOrigin: string;
  encryptionKey: Buffer | null;
  hmacKey: Buffer | null;
  cookieSecret: string | null;
  secure: boolean;
}>;

export type AppConfig = Readonly<{
  host: string;
  port: number;
  databasePath: string;
  databaseProvider: 'sqlite' | 'postgres';
  postgresUrl: string;
  publicDir: string;
  modelApiKey: string;
  modelEnabled: boolean;
  requestTimeoutMs: number;
  knowledgeProvider: 'local' | 'weknora';
  freshmanGuidePath: string | null;
  weknoraBaseUrl: string;
  weknoraApiKey: string;
  weknoraDocumentKbId: string;
  weknoraFaqKbId: string;
  weknoraScoreThreshold: number;
  searchProvider: 'unavailable' | 'searxng';
  searxngBaseUrl: string;
  searchTimeoutMs: number;
  searchMaxResults: number;
  disclaimer: string;
  roommate?: RoommateConfig;
}>;

const DEFAULT_DISCLAIMER = '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别';

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function scoreFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function decodeBase64Secret(value: string | undefined): Buffer | null {
  const trimmed = value?.trim() ?? '';
  if (
    trimmed.length === 0
    || trimmed.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(trimmed)
  ) {
    return null;
  }
  const decoded = Buffer.from(trimmed, 'base64');
  return decoded.length >= 32 && decoded.toString('base64') === trimmed
    ? decoded
    : null;
}

function normalizeEncryptionKey(value: string | undefined): Buffer | null {
  const decoded = decodeBase64Secret(value);
  if (decoded === null || decoded.length === 32) {
    return decoded;
  }
  return createHash('sha256').update(decoded).digest();
}

function parseHttpsOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  try {
    const origin = new URL(trimmed);
    return origin.protocol === 'https:' ? origin.origin : null;
  } catch {
    return null;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv, appRoot: string): AppConfig {
  const modelApiKey = (env.TOKENDANCE_API_KEY ?? '').trim();
  const roommateRequested = env.ROOMMATE_MATCHING_ENABLED === 'true';
  const roommateOrigin = parseHttpsOrigin(env.ROOMMATE_PUBLIC_ORIGIN);
  const roommateEncryptionKey = normalizeEncryptionKey(env.ROOMMATE_ENCRYPTION_KEY);
  const roommateHmacKey = decodeBase64Secret(env.ROOMMATE_HMAC_KEY);
  const roommateCookieKey = decodeBase64Secret(env.ROOMMATE_COOKIE_SECRET);
  const roommate: RoommateConfig = {
    requested: roommateRequested,
    publicOrigin: roommateOrigin ?? '',
    encryptionKey: roommateEncryptionKey,
    hmacKey: roommateHmacKey,
    cookieSecret: roommateCookieKey ? env.ROOMMATE_COOKIE_SECRET?.trim() ?? null : null,
    secure: roommateRequested
      && roommateOrigin !== null
      && roommateEncryptionKey !== null
      && roommateHmacKey !== null
      && roommateCookieKey !== null,
  };

  return {
    host: env.HOST ?? '0.0.0.0',
    port: numberFromEnv(env.PORT, 3210),
    databasePath: path.resolve(appRoot, env.DATABASE_PATH ?? 'runtime/live-in-hdu.db'),
    databaseProvider: env.DATABASE_PROVIDER?.trim().toLowerCase() === 'postgres'
      ? 'postgres'
      : 'sqlite',
    postgresUrl: env.POSTGRES_URL?.trim() ?? '',
    publicDir: path.resolve(appRoot, 'dist/client'),
    modelApiKey,
    modelEnabled: modelApiKey.length > 0,
    requestTimeoutMs: numberFromEnv(env.REQUEST_TIMEOUT_MS, 20000),
    knowledgeProvider: env.KNOWLEDGE_PROVIDER?.trim().toLowerCase() === 'weknora'
      ? 'weknora'
      : 'local',
    freshmanGuidePath: env.FRESHMAN_GUIDE_PATH?.trim()
      ? path.resolve(appRoot, env.FRESHMAN_GUIDE_PATH.trim())
      : null,
    weknoraBaseUrl: env.WEKNORA_BASE_URL?.trim() ?? 'http://127.0.0.1:8080/api/v1',
    weknoraApiKey: env.WEKNORA_API_KEY?.trim() ?? '',
    weknoraDocumentKbId: env.WEKNORA_DOCUMENT_KB_ID?.trim() ?? '',
    weknoraFaqKbId: env.WEKNORA_FAQ_KB_ID?.trim() ?? '',
    weknoraScoreThreshold: scoreFromEnv(env.WEKNORA_SCORE_THRESHOLD, 0.55),
    searchProvider: env.SEARCH_PROVIDER?.trim().toLowerCase() === 'searxng'
      ? 'searxng'
      : 'unavailable',
    searxngBaseUrl: env.SEARXNG_BASE_URL?.trim() ?? 'http://127.0.0.1:8888',
    searchTimeoutMs: numberFromEnv(env.SEARCH_TIMEOUT_MS, 10000),
    searchMaxResults: Math.min(numberFromEnv(env.SEARCH_MAX_RESULTS, 6), 6),
    disclaimer: DEFAULT_DISCLAIMER,
    roommate,
  };
}
