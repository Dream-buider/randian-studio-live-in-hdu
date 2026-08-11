import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(import.meta.dirname, '..');
const verifier = path.join(appRoot, 'scripts', 'verify-roommate-readiness.mts');

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCyR3eJfuwONVJg
gELaHJtP6RmqCzT1y4eIGDq+p2GCID03hMtVZXjOr/QYu7P159k0JP+8FaUd+05F
C9k1yZHgrmbAB1zFuwZ+WNh4k+sc6MYPrF0WNBFm2FF1m7vzCEboZHNVNZDWfWLi
Ms+7e86lJiWMuoPPQ/cWb1Ksj2f0xI8u1ZIqHWH957dQMsq3s/MKhd8BqIjh/ns3
OzuKl3NIZ35o7D2+wqdTj0jMZWaILrFv+iu0Up224RFwOe5TEQT2TXaUcGtvrxqr
tHbzJthjBK/h6UoA3+8SiBTieccXYxr1DOnbrTxvTuv7b+7JxrhTmnAPiXEGXtrn
8pGlGQHbAgMBAAECggEAGtZgAVEbpJvpoGCj2lpaFbJ9IY2kVagOPrI0YwT8IcRL
/YfpEBxBY7k1zA9dl5QPrNDbtUBQ5e2HKnpjzWa1pha68wdos39kX9rCDjdo5PuJ
l/cWNZnK+39u69Rw0Qoa79rx8w7S6ecK3rWlczoVBo7H3PfVkHr7vuMtP+V//Gbl
yxdzOgsiqPECoDS157t20f5/QEERaTcuTH6MVZOvFO+/9cC97UlTDMlQA8bVjbA8
TH0NRQVMN+JRO1+N/ZWvnbInBZJyaeYja7JHoIak5l2UxGp8jBpQsmOMMWODX4iV
SRKlpjOXh1EXLZ5cHJ0EUDV/P9D++golGpN4ls5ISQKBgQDwIZ8mRw/VVm3BQqm5
4eMCHB4pujxh1yQHuafsAa526ezY1Ct2945J1yBIE9uFfH0pLPaxGvSOIVG+nJ33
cGKQPWAZKVmEAossKzK8UF7Bu2TAPl0KoNIsNap4774hmV+/is78pSIaTalBks64
kue1amTanFZ97XLG2OTMIXcofwKBgQC+D3jyAJceglgKUCdrG4NbnHxh/ZK88tgc
bs5W6NvbJb4ZNlEM2xnAIYsru41zkFBAW1XqR6Y3uNGX25tgHKrpv8rTdy2Q7kWo
EIU9stHGCEVNi/0U4dFHvpPL3AtVAdd3J4EAkxq9YB+3BMQB1WEGN8cif5Hz5GYr
3GMjWIAYpQKBgQCf/MacKhxSdxMI//E091rXvQQbqQkx5rUKsJdAlp42fARhMnsC
+EzExZ+sZg6METUSifKSbPMi/vAHnzFf+nCwyTONkA8j9M3kz6Mt9B4t1Tx7GRHE
UwG0kszRZmm22QkCBOmDSkI+ZB+woK86KiZWqFwpip/Vpq4h7cACgQly4QKBgQCX
tFPunsgA4zuQ58++75QXEL47nSJ+TTxw3YU32+B5eRPWngNtxok0UdH7U1Yh0yQr
anwWZ6BmQ9CQbQsFWXyW3a7wweUOFRJmhuFDkTNd5YYj0sRs4Z6hrJ3eD8K/1Jt+
kXqn0cN7O3m1JUmqyP4L74O0pq0CRuHCysQbF24PvQKBgHSjGRiT5jqZB+DJKnLI
bx3LJF8NnRfmc91RnETCFwgGGAVeryLAqP96u1yoxz00Q1Tt2t4kXraQZZHkq77Z
g2JMChHFDm2EezMny34jeMBmBEJyQlJBlhPE7+apXrIn07gwyVm2oZpWoFCFxizD
/fcFtOdEPbwMtG+RPErzZvtA
-----END PRIVATE KEY-----`;

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUT2mpGsGAdOX6vUDquk8QObnGDIkwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDgxMTE1NDIzNVoXDTI2MDgx
MzE1NDIzNVowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAskd3iX7sDjVSYIBC2hybT+kZqgs09cuHiBg6vqdhgiA9
N4TLVWV4zq/0GLuz9efZNCT/vBWlHftORQvZNcmR4K5mwAdcxbsGfljYeJPrHOjG
D6xdFjQRZthRdZu78whG6GRzVTWQ1n1i4jLPu3vOpSYljLqDz0P3Fm9SrI9n9MSP
LtWSKh1h/ee3UDLKt7PzCoXfAaiI4f57Nzs7ipdzSGd+aOw9vsKnU49IzGVmiC6x
b/ortFKdtuERcDnuUxEE9k12lHBrb68aq7R28ybYYwSv4elKAN/vEogU4nnHF2Ma
9Qzp2608b07r+2/uyca4U5pwD4lxBl7a5/KRpRkB2wIDAQABo1MwUTAdBgNVHQ4E
FgQUCNbOKo2GcZBICHEFTeg0Et0rf1owHwYDVR0jBBgwFoAUCNbOKo2GcZBICHEF
Teg0Et0rf1owDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAPNGR
3eEt4+52CO+WPPkzHEVqccMiRutYYPihv9RCnq3xkifGAGVXPEGU5Gw8iNcUEWWS
bo0cNgHTLlm8I+2sxX787mM/Hwm12Dy712mN/Imb27DObO/gGM0GGa8s9RvqkELV
6autN22rNPj2h08SNfwOOxIl2De3mvrINPmklhyj1EO0zv/Ym6yVAOCtCNX5Bf6g
qcJwA+fHktScccrUq2jtOmND4emJJFeuOetBjk3NyVBpIRz148j65SW3cc86zx/t
xiFrDglpjtfzO/G+LNui1EF5RGSTP/sWWQjWpk3jju8yqVssNIiGOl1BIlCdxl5G
XrME4KHk/3WqrUhVbQ==
-----END CERTIFICATE-----`;

const CONFIG = {
  enabled: true,
  retentionDays: 90,
  campuses: [
    { code: 'xiasha', name: '下沙校区', templateVersion: 'xiasha-v1', enabled: true },
    {
      code: 'shaoxing', name: '绍兴校区', templateVersion: null, enabled: false,
      unavailableReason: '寝室分配规则确认中，暂未开放匹配',
    },
  ],
};

const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

type FixtureOptions = {
  enabled?: boolean;
  includeSecurityHeaders?: boolean;
  adminStatus?: number;
};

async function runVerifier(baseUrl: string, expectSuccess: boolean) {
  const environment = {
    ...process.env,
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
    ROOMMATE_ENCRYPTION_KEY: 'SENTINEL_ENCRYPTION_SECRET',
    ROOMMATE_HMAC_KEY: 'SENTINEL_HMAC_SECRET',
    ROOMMATE_COOKIE_SECRET: 'SENTINEL_COOKIE_SECRET',
  };
  try {
    const result = await execFileAsync(process.execPath, [
      '--import', 'tsx', verifier, '--base-url', baseUrl,
    ], { cwd: appRoot, env: environment });
    assert.equal(expectSuccess, true, `unexpected success: ${result.stdout}`);
    return result;
  } catch (error) {
    if (expectSuccess) throw error;
    return error as { stdout?: string; stderr?: string };
  }
}

async function withHttpsFixture(options: FixtureOptions, run: (baseUrl: string, requests: string[]) => Promise<void>) {
  const requests: string[] = [];
  const server = createHttpsServer({ key: TEST_KEY, cert: TEST_CERT }, (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const headers = options.includeSecurityHeaders === false ? {} : SECURITY_HEADERS;
    if (request.url === '/api/roommates/config') {
      response.writeHead(200, { ...headers, 'content-type': 'application/json' });
      response.end(JSON.stringify({ ...CONFIG, enabled: options.enabled ?? true }));
      return;
    }
    if (request.url === '/api/health') {
      response.writeHead(200, { ...headers, 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.url === '/api/roommates/members') {
      response.writeHead(404, { ...headers, 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Invalid or expired session' } }));
      return;
    }
    if (request.url === '/api/admin/roommates' || request.url === '/api/reviews') {
      response.writeHead(options.adminStatus ?? 403, { ...headers, 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }));
      return;
    }
    response.writeHead(404, headers).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`https://127.0.0.1:${address.port}`, requests);
  } finally {
    server.close();
  }
}

test('rejects a plain HTTP deployment without making roommate mutations', async () => {
  const requests: string[] = [];
  const server = createHttpServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(CONFIG));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const result = await runVerifier(`http://127.0.0.1:${address.port}`, false);
    assert.match(`${result.stdout ?? ''}${result.stderr ?? ''}`, /HTTPS/i);
    assert.deepEqual(requests, []);
  } finally {
    server.close();
  }
});

test('rejects a disabled roommate deployment', async () => {
  await withHttpsFixture({ enabled: false }, async (baseUrl) => {
    const result = await runVerifier(baseUrl, false);
    assert.match(`${result.stdout ?? ''}${result.stderr ?? ''}`, /disabled/i);
  });
});

test('rejects enabled responses without required transport security headers', async () => {
  await withHttpsFixture({ includeSecurityHeaders: false }, async (baseUrl) => {
    const result = await runVerifier(baseUrl, false);
    assert.match(`${result.stdout ?? ''}${result.stderr ?? ''}`, /security header/i);
  });
});

test('rejects a publicly readable roommate admin endpoint', async () => {
  await withHttpsFixture({ adminStatus: 200 }, async (baseUrl) => {
    const result = await runVerifier(baseUrl, false);
    assert.match(`${result.stdout ?? ''}${result.stderr ?? ''}`, /admin.*protected/i);
  });
});

test('passes only enabled HTTPS templates, health, unauthenticated member denial, and admin denial', async () => {
  await withHttpsFixture({}, async (baseUrl, requests) => {
    const result = await runVerifier(baseUrl, true);
    assert.match(result.stdout, /roommate readiness passed/i);
    const combinedOutput = `${result.stdout}${result.stderr}`;
    assert.doesNotMatch(combinedOutput, /SENTINEL_(ENCRYPTION|HMAC|COOKIE)_SECRET/);
    assert.deepEqual(requests, [
      'GET /api/roommates/config',
      'GET /api/health',
      'GET /api/roommates/members',
      'GET /api/admin/roommates',
      'GET /api/reviews',
    ]);
    assert.equal(requests.some((item) => !item.startsWith('GET ')), false);
  });
});
