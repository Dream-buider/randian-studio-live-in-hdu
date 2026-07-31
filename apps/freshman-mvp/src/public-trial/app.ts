import { randomUUID as createRandomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type { PublicTrialConfig } from './config.js';
import { renderTrialLoginPage } from './login-page.js';
import { FixedWindowLimiter } from './rate-limit.js';
import {
  clearSessionCookie,
  createSessionToken,
  matchesAccessCode,
  readSessionCookie,
  serializeSessionCookie,
  verifySessionToken,
  type TrialSessionPayload,
} from './session.js';

export interface TrialLogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

export interface PublicTrialDependencies {
  config: PublicTrialConfig;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  randomUUID?: () => string;
  writeLog?: (entry: TrialLogEntry) => void | Promise<void>;
}

const NOT_FOUND = {
  error: { code: 'NOT_FOUND', message: 'Route not found' },
};

function validSession(
  request: FastifyRequest,
  config: PublicTrialConfig,
  now: number,
): TrialSessionPayload | null {
  const token = readSessionCookie(request.headers.cookie);
  return token === null ? null : verifySessionToken(token, config.sessionSecret, now);
}

function requireBrowserSession(
  request: FastifyRequest,
  reply: FastifyReply,
  config: PublicTrialConfig,
  now: number,
): boolean {
  if (validSession(request, config, now)) {
    return true;
  }
  void reply.redirect('/trial/login');
  return false;
}

function requireApiSession(
  request: FastifyRequest,
  reply: FastifyReply,
  config: PublicTrialConfig,
  now: number,
): TrialSessionPayload | null {
  const session = validSession(request, config, now);
  if (session) {
    return session;
  }
  void reply.code(401).send({
    error: { code: 'AUTH_REQUIRED', message: '请先输入团队测试码' },
  });
  return null;
}

function contentTypeFor(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
  }[extension] ?? 'application/octet-stream';
}

async function sendFile(reply: FastifyReply, filePath: string): Promise<void> {
  const contents = await readFile(filePath);
  void reply.type(contentTypeFor(filePath)).send(contents);
}

function safeAssetPath(publicDir: string, requestPath: string): string | null {
  const normalized = requestPath.replaceAll('\\', '/');
  if (
    normalized.length === 0
    || normalized.includes('\0')
    || normalized.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    return null;
  }
  const assetRoot = path.resolve(publicDir, 'assets');
  const target = path.resolve(assetRoot, normalized);
  const relative = path.relative(assetRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return target;
}

function forwardedHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'x-request-id']) {
    const value = request.headers[name];
    if (typeof value === 'string') {
      headers.set(name, value);
    }
  }
  return headers;
}

function isQuestionContext(value: unknown): value is {
  intentId: string | null;
  question: string;
  category: string | null;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const context = value as Record<string, unknown>;
  return (context.intentId === null || typeof context.intentId === 'string')
    && typeof context.question === 'string'
    && (context.category === null || typeof context.category === 'string');
}

function publicQuestionBody(
  body: unknown,
  maxCodePoints: number,
): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const supplied = body as Record<string, unknown>;
  if (typeof supplied.question !== 'string') {
    return null;
  }
  const question = supplied.question.trim();
  if (question.length === 0 || [...question].length > maxCodePoints) {
    return null;
  }
  const result: Record<string, unknown> = { question };
  if (isQuestionContext(supplied.context)) {
    result.context = {
      intentId: supplied.context.intentId,
      question: supplied.context.question,
      category: supplied.context.category,
    };
  }
  if (
    typeof supplied.requestId === 'string'
    && supplied.requestId.length > 0
    && supplied.requestId.length <= 200
  ) {
    result.requestId = supplied.requestId;
  }
  return result;
}

export function createPublicTrialApp(
  deps: PublicTrialDependencies,
): FastifyInstance {
  const app = Fastify({ logger: false });
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const randomUUID = deps.randomUUID ?? createRandomUUID;
  const indexPath = path.resolve(deps.config.publicDir, 'index.html');
  const limiter = new FixedWindowLimiter(
    deps.config.questionLimit,
    deps.config.questionWindowMs,
  );
  const requestStarts = new WeakMap<FastifyRequest, number>();
  const requestLogIds = new WeakMap<FastifyRequest, string>();
  let requestSequence = 0;

  app.addHook('onRequest', async (request) => {
    requestStarts.set(request, now());
    requestSequence += 1;
    requestLogIds.set(request, `trial-${requestSequence}`);
  });
  app.addHook('onResponse', async (request, reply) => {
    if (!deps.writeLog) {
      return;
    }
    const finishedAt = now();
    const route = request.routeOptions.url ?? 'unmatched';
    try {
      await deps.writeLog({
        timestamp: new Date(finishedAt).toISOString(),
        requestId: requestLogIds.get(request) ?? 'trial-unknown',
        method: request.method,
        route,
        statusCode: reply.statusCode,
        durationMs: Math.max(0, finishedAt - (requestStarts.get(request) ?? finishedAt)),
      });
    } catch {
      // Operational logging must never block or disclose a user response.
    }
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send(NOT_FOUND));
  app.setErrorHandler((_error, _request, reply) => reply.code(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  }));

  app.get('/trial/login', async (request, reply) => {
    if (validSession(request, deps.config, now())) {
      return reply.redirect('/');
    }
    return reply.type('text/html; charset=utf-8').send(renderTrialLoginPage());
  });

  app.post<{ Body: unknown }>('/trial/login', async (request, reply) => {
    const code = typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>).code
      : undefined;
    if (!matchesAccessCode(deps.config.accessCode, code)) {
      return reply.code(401).send({
        error: { code: 'INVALID_ACCESS_CODE', message: '测试码不正确' },
      });
    }
    const issuedAt = now();
    const token = createSessionToken({
      sessionId: randomUUID(),
      issuedAt,
      expiresAt: issuedAt + deps.config.sessionTtlSeconds * 1_000,
    }, deps.config.sessionSecret);
    return reply
      .header('set-cookie', serializeSessionCookie(token))
      .send({ status: 'ok' });
  });

  app.post('/trial/logout', async (_request, reply) => reply
    .header('set-cookie', clearSessionCookie())
    .send({ status: 'ok' }));

  for (const route of ['/', '/chat']) {
    app.get(route, async (request, reply) => {
      if (!requireBrowserSession(request, reply, deps.config, now())) {
        return;
      }
      await sendFile(reply, indexPath);
    });
  }

  app.get('/favicon.svg', async (request, reply) => {
    if (!requireBrowserSession(request, reply, deps.config, now())) {
      return;
    }
    await sendFile(reply, path.resolve(deps.config.publicDir, 'favicon.svg'));
  });

  app.get<{ Params: { '*': string } }>('/assets/*', async (request, reply) => {
    if (!requireBrowserSession(request, reply, deps.config, now())) {
      return;
    }
    const target = safeAssetPath(deps.config.publicDir, request.params['*']);
    if (!target) {
      return reply.code(404).send(NOT_FOUND);
    }
    try {
      await sendFile(reply, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return reply.code(404).send(NOT_FOUND);
      }
      throw error;
    }
  });

  async function proxyUpstream(
    request: FastifyRequest,
    reply: FastifyReply,
    pathname: '/api/questions' | '/api/ask',
    body?: Record<string, unknown>,
  ): Promise<void> {
    const upstream = await fetchImpl(`${deps.config.upstreamOrigin}${pathname}`, {
      method: request.method,
      headers: forwardedHeaders(request),
      body: request.method === 'POST' ? JSON.stringify(body) : undefined,
    });
    const responseBody = await upstream.text();
    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      void reply.type(contentType);
    }
    void reply.code(upstream.status).send(responseBody);
  }

  app.get('/api/questions', async (request, reply) => {
    if (!requireApiSession(request, reply, deps.config, now())) {
      return;
    }
    await proxyUpstream(request, reply, '/api/questions');
  });
  app.post('/api/ask', async (request, reply) => {
    const session = requireApiSession(request, reply, deps.config, now());
    if (!session) {
      return;
    }
    const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      return reply.code(415).send({
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: '仅支持 JSON 请求' },
      });
    }
    const body = publicQuestionBody(request.body, deps.config.maxQuestionCodePoints);
    if (!body) {
      return reply.code(400).send({
        error: { code: 'INVALID_QUESTION', message: '问题不能为空且最多 500 个字符' },
      });
    }
    const limit = limiter.consume(session.sessionId, now());
    if (!limit.allowed) {
      return reply
        .header('retry-after', String(limit.retryAfterSeconds))
        .code(429)
        .send({
          error: { code: 'RATE_LIMITED', message: '测试请求较多，请稍后再试' },
        });
    }
    await proxyUpstream(request, reply, '/api/ask', body);
  });

  return app;
}
