import process from 'node:process';

const REQUEST_TIMEOUT_MS = 10_000;
const DENIED_STATUSES = new Set([401, 403, 404]);

function readBaseUrl(argv: string[]): URL {
  const index = argv.indexOf('--base-url');
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value) {
    throw new Error('Usage: verify-roommates --base-url https://liveinhdu.cn');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('Roommate readiness requires an HTTPS base URL.');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Base URL must be an HTTPS origin without credentials, path, query, or fragment.');
  }
  return url;
}

function endpoint(baseUrl: URL, pathname: string): URL {
  return new URL(pathname, baseUrl);
}

function requireSecurityHeaders(response: Response, pathname: string): void {
  const hsts = response.headers.get('strict-transport-security') ?? '';
  if (!/max-age=\d+/i.test(hsts)) {
    throw new Error(`Required security header is missing on ${pathname}: Strict-Transport-Security`);
  }
  if (response.headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff') {
    throw new Error(`Required security header is missing on ${pathname}: X-Content-Type-Options`);
  }
  const referrerPolicy = response.headers.get('referrer-policy')?.trim() ?? '';
  if (!referrerPolicy || referrerPolicy.toLowerCase() === 'unsafe-url') {
    throw new Error(`Required security header is missing on ${pathname}: Referrer-Policy`);
  }
  if (response.headers.has('set-cookie')) {
    throw new Error(`Unexpected session cookie on read-only probe ${pathname}`);
  }
}

async function get(baseUrl: URL, pathname: string, headers?: HeadersInit): Promise<Response> {
  const response = await fetch(endpoint(baseUrl, pathname), {
    method: 'GET',
    redirect: 'error',
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  requireSecurityHeaders(response, pathname);
  return response;
}

async function readJson(response: Response, pathname: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`${pathname} did not return valid JSON`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function verifyConfig(value: unknown): void {
  if (!isRecord(value)) throw new Error('Roommate config response is invalid.');
  if (value.enabled !== true) throw new Error('Roommate matching is disabled.');
  if (value.retentionDays !== 90 || !Array.isArray(value.campuses)) {
    throw new Error('Roommate config retention or campus templates are invalid.');
  }
  const xiasha = value.campuses.find((item) => isRecord(item) && item.code === 'xiasha');
  const shaoxing = value.campuses.find((item) => isRecord(item) && item.code === 'shaoxing');
  if (
    !isRecord(xiasha)
    || xiasha.enabled !== true
    || xiasha.templateVersion !== 'xiasha-v1'
  ) {
    throw new Error('Expected enabled XiaSha xiasha-v1 template.');
  }
  if (
    !isRecord(shaoxing)
    || shaoxing.enabled !== false
    || shaoxing.templateVersion !== null
    || typeof shaoxing.unavailableReason !== 'string'
    || !shaoxing.unavailableReason.includes('暂未开放匹配')
  ) {
    throw new Error('Expected disabled Shaoxing pending template.');
  }
}

async function verifyReadiness(baseUrl: URL): Promise<void> {
  const configResponse = await get(baseUrl, '/api/roommates/config');
  if (configResponse.status !== 200) throw new Error('Roommate config endpoint is unavailable.');
  verifyConfig(await readJson(configResponse, '/api/roommates/config'));

  const healthResponse = await get(baseUrl, '/api/health');
  const health = await readJson(healthResponse, '/api/health');
  if (healthResponse.status !== 200 || !isRecord(health) || health.status !== 'ok') {
    throw new Error('Application health endpoint is not healthy.');
  }

  const invalidCookie = { cookie: 'live_in_hdu_roommate=readiness.invalid' };
  const memberResponse = await get(baseUrl, '/api/roommates/members', invalidCookie);
  if (!DENIED_STATUSES.has(memberResponse.status)) {
    throw new Error('Unauthenticated roommate member access is not protected.');
  }

  const adminResponse = await get(baseUrl, '/api/admin/roommates');
  if (!DENIED_STATUSES.has(adminResponse.status)) {
    throw new Error('Public roommate admin access is not protected.');
  }

  const reviewsResponse = await get(baseUrl, '/api/reviews');
  if (!DENIED_STATUSES.has(reviewsResponse.status)) {
    throw new Error('Public review access is not protected.');
  }

  process.stdout.write(
    `Roommate readiness passed: config=${configResponse.status} health=${healthResponse.status} `
      + `members=${memberResponse.status} admin=${adminResponse.status} reviews=${reviewsResponse.status}\n`,
  );
}

try {
  await verifyReadiness(readBaseUrl(process.argv.slice(2)));
} catch (error) {
  const message = error instanceof Error ? error.message : 'Roommate readiness failed.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
