import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const TRIAL_SESSION_COOKIE = 'live_in_hdu_trial';

export interface TrialSessionPayload {
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}

export function matchesAccessCode(expected: string, supplied: unknown): boolean {
  if (typeof supplied !== 'string') {
    return false;
  }
  return timingSafeEqual(digest(expected), digest(supplied));
}

export function createSessionToken(
  payload: TrialSessionPayload,
  secret: string,
): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

function isSessionPayload(value: unknown): value is TrialSessionPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return typeof payload.sessionId === 'string'
    && payload.sessionId.length > 0
    && Number.isSafeInteger(payload.issuedAt)
    && Number.isSafeInteger(payload.expiresAt)
    && Number(payload.expiresAt) > Number(payload.issuedAt);
}

export function verifySessionToken(
  token: string,
  secret: string,
  now: number,
): TrialSessionPayload | null {
  try {
    const segments = token.split('.');
    if (segments.length !== 2 || !segments[0] || !segments[1]) {
      return null;
    }
    const expected = signature(segments[0], secret);
    const supplied = segments[1];
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const suppliedBuffer = Buffer.from(supplied, 'utf8');
    if (
      expectedBuffer.length !== suppliedBuffer.length
      || !timingSafeEqual(expectedBuffer, suppliedBuffer)
    ) {
      return null;
    }
    const parsed = JSON.parse(
      Buffer.from(segments[0], 'base64url').toString('utf8'),
    ) as unknown;
    if (!isSessionPayload(parsed) || parsed.issuedAt > now || parsed.expiresAt <= now) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function serializeSessionCookie(token: string): string {
  return `${TRIAL_SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`;
}

export function clearSessionCookie(): string {
  return `${TRIAL_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  for (const item of header.split(';')) {
    const [name, ...rest] = item.trim().split('=');
    if (name === TRIAL_SESSION_COOKIE && rest.length > 0) {
      return rest.join('=') || null;
    }
  }
  return null;
}
