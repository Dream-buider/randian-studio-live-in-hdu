import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const START = path.join(REPO_ROOT, 'scripts', 'start-public-trial.ps1');
const STOP = path.join(REPO_ROOT, 'scripts', 'stop-public-trial.ps1');
const VERIFY = path.join(REPO_ROOT, 'scripts', 'test-public-trial.ps1');
const CONFIGURE = path.join(REPO_ROOT, 'scripts', 'configure-public-trial-tunnel.ps1');
const QR = path.join(REPO_ROOT, 'apps', 'freshman-mvp', 'scripts', 'generate-public-trial-qr.mts');
const STOP_STACK = path.join(REPO_ROOT, 'scripts', 'stop-knowledge-stack.ps1');
const TEMP_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\temp';

function runStatic(script: string): Record<string, unknown> {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', script, '-StaticOnly'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, TEMP: TEMP_ROOT, TMP: TEMP_ROOT },
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

test('public trial scripts keep runtime on D, gateway on loopback and never mutate firewall', () => {
  const startText = readFileSync(START, 'utf8');
  const stopText = readFileSync(STOP, 'utf8');
  assert.match(startText, /127\.0\.0\.1/);
  assert.match(startText, /3211/);
  assert.match(startText, /D:\\Star\\LIVE_IN_HDU_RUNTIME/);
  assert.doesNotMatch(stopText, /down\s+-v|Remove-Item.+postgres|Remove-Item.+weknora/is);

  for (const script of [START, STOP, VERIFY]) {
    const plan = runStatic(script);
    assert.equal(plan.mode, 'static');
    assert.match(String(plan.runtimeRoot), /^D:\\/i);
    assert.equal(plan.processStarted, false);
    assert.equal(plan.firewallMutation, false);
  }
});

test('public trial startup builds only isolated server and trial-client artifacts', () => {
  const plan = runStatic(START);
  assert.deepEqual(plan.buildScripts, ['build:server', 'build:trial']);
});

test('public trial verifier requires the authenticated guide route', async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    requests.push(pathname);
    const authenticated = Boolean(request.headers.cookie);
    const blocked = ['/admin', '/api/admin/intents', '/api/reviews', '/api/health'];
    if (pathname === '/' && !authenticated) {
      response.writeHead(302, { Location: '/trial/login' }).end();
      return;
    }
    if (blocked.includes(pathname)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(
        'pwsh',
        [
          '-NoProfile',
          '-File',
          VERIFY,
          '-BaseUrl',
          `http://127.0.0.1:${address.port}`,
          '-CookieHeader',
          'live-in-hdu=accepted',
        ],
        {
          cwd: REPO_ROOT,
          windowsHide: true,
          env: { ...process.env, TEMP: TEMP_ROOT, TMP: TEMP_ROOT },
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(requests.includes('/guide'), 'authenticated guide route was not verified');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
});

test('full knowledge-stack shutdown stops the public trial before the private gateway', () => {
  const contents = readFileSync(STOP_STACK, 'utf8');
  const publicStop = contents.indexOf('stop-public-trial.ps1');
  const privateStop = contents.indexOf('stop-freshman-platform.ps1');
  assert.ok(publicStop >= 0, 'public trial stop script is not integrated');
  assert.ok(privateStop >= 0, 'private platform stop script is missing');
  assert.ok(publicStop < privateStop, 'public trial must be stopped first');
});

test('starting the tunnel reuses an owned running gateway without treating its PID as foreign', () => {
  const start = readFileSync(START, 'utf8');
  assert.match(
    start,
    /if \(\$owned\)\s*\{[\s\S]*?\}\s*elseif \(Get-Process -Id \(\[int\]\$metadata\.pid\)[\s\S]*?\}\s*else\s*\{\s*Remove-Item -LiteralPath \$PidFile/,
  );
});

test('cpolar tunnel configuration is clipboard-only, D-backed and maps only the trial gateway', () => {
  const configure = readFileSync(CONFIGURE, 'utf8');
  const start = readFileSync(START, 'utf8');
  const stop = readFileSync(STOP, 'utf8');
  const verify = readFileSync(VERIFY, 'utf8');
  const qr = readFileSync(QR, 'utf8');

  assert.match(configure, /GetText\(\)/);
  assert.match(configure, /inspect_db_size:\s*-1/);
  assert.match(configure, /web_addr:\s*127\.0\.0\.1:4040/);
  assert.match(configure, /\[string\]\$HttpProxy/);
  assert.match(configure, /http_proxy:/);
  assert.match(configure, /IsLoopback/);
  assert.match(configure, /addr:\s*3211/);
  assert.match(configure, /proto:\s*http/);
  assert.match(configure, /inspect:\s*false/);
  assert.doesNotMatch(
    configure,
    /Write-Output[^\r\n]+authtoken|ConvertTo-Json[^\r\n]+authtoken/i,
  );
  assert.match(start, /-config=.*cpolar\.yml/is);
  assert.match(start, /live-in-hdu-trial/);
  assert.match(start, /\[string\]\$KnownPublicUrl/);
  assert.match(start, /Test-PublicTrialUrl/);
  assert.match(start, /\/trial\/login/);
  assert.match(start, /cpolar\\\.\(cn\|top\|io\|com\)/);
  assert.match(stop, /cpolar\.pid\.json/);
  assert.match(verify, /UseSavedPublicUrl/);
  assert.match(verify, /Get-CpolarHttpProxy/);
  assert.match(verify, /handler\.Proxy/);
  assert.match(qr, /errorCorrectionLevel:\s*'M'/);
  assert.match(qr, /D:\\\\Star\\\\LIVE_IN_HDU_RUNTIME/i);
});
