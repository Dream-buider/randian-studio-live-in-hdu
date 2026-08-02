import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function commonHeaders(extra = {}) {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...extra,
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, commonHeaders({ 'content-type': 'application/json; charset=utf-8' }));
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) {
      throw Object.assign(new Error('request body is too large'), { statusCode: 413 });
    }
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw Object.assign(new Error('invalid JSON'), { statusCode: 400 });
  }
}

async function sendStatic(response, publicDir, pathname) {
  const fileMap = {
    '/': 'index.html',
    '/admin': 'admin.html',
    '/styles.css': 'styles.css',
    '/app.js': 'app.js',
    '/admin.js': 'admin.js',
  };
  const filename = fileMap[pathname];
  if (!filename) return false;
  try {
    const content = await readFile(join(publicDir, filename));
    response.writeHead(200, commonHeaders({ 'content-type': MIME[extname(filename)] || 'application/octet-stream' }));
    response.end(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    sendJson(response, 404, { error: 'not found' });
  }
  return true;
}

export function createApp({ router, reviews, publicDir, demoMode }) {
  return async function app(request, response) {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(response, 200, { ok: true, mode: demoMode ? 'demo' : 'live' });
      }

      if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204, commonHeaders());
        return response.end();
      }

      if (request.method === 'POST' && url.pathname === '/api/ask') {
        const body = await readJson(request);
        return sendJson(response, 200, await router.answer(body.question));
      }

      if (request.method === 'GET' && url.pathname === '/api/reviews') {
        const status = url.searchParams.get('status') || undefined;
        return sendJson(response, 200, { items: await reviews.list({ status }) });
      }

      const reviewMatch = url.pathname.match(/^\/api\/reviews\/([0-9a-f-]+)$/i);
      if (request.method === 'PATCH' && reviewMatch) {
        const body = await readJson(request);
        const item = await reviews.decide(reviewMatch[1], body);
        return sendJson(response, 200, { item });
      }

      if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'not found' });
      if (request.method === 'GET' && await sendStatic(response, publicDir, url.pathname)) return;
      return sendJson(response, 404, { error: 'not found' });
    } catch (error) {
      const status = Number(error.statusCode) || 500;
      if (status >= 500) console.error('[freshman-mvp]', error);
      return sendJson(response, status, { error: status >= 500 ? 'internal server error' : error.message });
    }
  };
}
