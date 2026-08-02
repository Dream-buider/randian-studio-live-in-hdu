# LIVE IN HDU Public Team Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前 Windows 本机技术栈前增加一个只开放用户功能的受控公网内测入口，让分散在不同网络中的老板和 20 多名成员通过 HTTPS 完成真实体验，同时形成可交给后续技术人员的启停、验收和运维材料。

**Architecture:** 保留 `127.0.0.1:3210` 作为本机完整业务及管理入口；新增监听 `127.0.0.1:3211` 的 Fastify 公网测试网关，使用测试码签发 12 小时 HMAC 会话，只提供用户专用前端、`GET /api/questions` 和 `POST /api/ask`。cpolar 仅映射 `3211`，配置、日志、PID、二维码和临时输出全部位于 `D:\Star\LIVE_IN_HDU_RUNTIME`。

**Tech Stack:** Node.js 24、TypeScript 6、Fastify 5、Vue 3、Vue Router 4、Vite 7、Vitest 3、Node test runner、PowerShell 7、cpolar、PostgreSQL、WeKnora、Ollama、SearXNG、TokenDance。

## Global Constraints

- 公网只能访问测试登录、退出、用户 HTML/静态资源、`GET /api/questions` 和 `POST /api/ask`；其他路径和方法默认返回 404。
- `/admin`、`/api/admin/*`、`/api/reviews*`、`/api/health`、数据库、WeKnora、SearXNG 和 Ollama 绝不直接映射公网。
- 正常问题继续走既有三段式回答与 FIFO 审核回流；公网网关不得复制业务路由或创建第二套答案库。
- 测试码、会话密钥、cpolar authtoken、API Key 和数据库连接串只写入 Git 忽略文件，不出现在日志、二维码、截图、文档或提交历史中。
- 会话 Cookie 固定为 12 小时有效，使用 `HttpOnly; Secure; SameSite=Lax; Path=/`。
- `POST /api/ask` 的公网问题最长 500 个 Unicode 码点，每个会话每 10 分钟最多 30 次。
- 所有新增运行数据、缓存、日志、下载、PID、配置副本和二维码都位于 `D:\Star\LIVE_IN_HDU_RUNTIME`。
- 公网测试入口只监听 `127.0.0.1:3211`；不得添加 Windows 防火墙公网入站规则。
- Q11 必须继续保持空白；未经审核的内容不得自动发布。
- 不修改或提交用户已有的未跟踪 `config/`、`vendor/`、`最新资料/` 和中文记录文件。
- 不执行 `docker compose down -v`，停止流程只能停止进程和容器并保留数据。

---

## File Map

### Create

- `apps/freshman-mvp/src/public-trial/config.ts`：解析并验证公网内测专用环境变量。
- `apps/freshman-mvp/src/public-trial/session.ts`：常量时间校验测试码，签发和验证 HMAC 会话。
- `apps/freshman-mvp/src/public-trial/rate-limit.ts`：按会话维护固定窗口提问限流。
- `apps/freshman-mvp/src/public-trial/login-page.ts`：返回不依赖外部 CDN 的移动端测试登录页。
- `apps/freshman-mvp/src/public-trial/app.ts`：白名单路由、会话钩子、静态文件和上游代理。
- `apps/freshman-mvp/src/public-trial/index.ts`：生产入口、信号处理和监听。
- `apps/freshman-mvp/test/public-trial-config.test.ts`：配置、D 盘约束和密钥缺失测试。
- `apps/freshman-mvp/test/public-trial-session.test.ts`：测试码和 Cookie 会话测试。
- `apps/freshman-mvp/test/public-trial-gateway.test.ts`：白名单、代理、限流、日志脱敏测试。
- `apps/freshman-mvp/test/web/public-trial-router.test.ts`：用户专用路由构建测试。
- `apps/freshman-mvp/scripts/generate-public-trial-qr.mts`：根据 HTTPS 地址生成 D 盘 PNG 二维码。
- `scripts/start-public-trial.ps1`：构建并启动 `3211` 网关及 cpolar。
- `scripts/stop-public-trial.ps1`：只停止公网网关和 cpolar，不停止完整知识栈。
- `scripts/test-public-trial.ps1`：本机及公网白名单自动验收。
- `apps/freshman-mvp/test/public-trial-scripts.test.ts`：启停脚本静态和隔离测试。
- `docs/PUBLIC_TEAM_TRIAL_RUNBOOK.md`：面向当前操作者和接替人员的内测运维手册。
- `docs/PUBLIC_TEAM_TRIAL_BRIEF.md`：给老板和测试成员的一页式产品说明。
- `docs/PUBLIC_TEAM_TRIAL_FEEDBACK_TEMPLATE.md`：统一反馈字段及群内说明。
- `docs/TECHNICAL_HANDOFF.md`：后续技术人员接管边界。

### Modify

- `apps/freshman-mvp/web/router.ts`：允许构造不含管理路由的用户专用 Router。
- `apps/freshman-mvp/vite.config.ts`：新增 `public-trial` 构建模式及独立输出目录。
- `apps/freshman-mvp/package.json`、`package-lock.json`：增加 `build:trial`、`start:trial`、二维码生成依赖和脚本。
- `apps/freshman-mvp/.env.example`：加入不含真实值的公网内测配置模板。
- `scripts/stop-knowledge-stack.ps1`：停止完整栈前先安全停止公网入口。
- `apps/freshman-mvp/test/lifecycle-scripts.test.ts`：覆盖完整栈停止时的公网入口顺序。
- `docs/PHASE_B_LOCAL_RUNBOOK.md`、`docs/SESSION_CHECKPOINT_CURRENT.md`、`TASKS.md`、`CHANGELOG.md`：记录可恢复状态和验收结论。

---

### Task 1: Build a user-only frontend artifact

**Files:**
- Modify: `apps/freshman-mvp/web/router.ts`
- Modify: `apps/freshman-mvp/vite.config.ts`
- Modify: `apps/freshman-mvp/package.json`
- Modify: `apps/freshman-mvp/package-lock.json`
- Create: `apps/freshman-mvp/test/web/public-trial-router.test.ts`

**Interfaces:**
- Consumes: existing `QuestionDeckView`, `ChatView`, `AdminView` and `createAppRouter()` callers.
- Produces: `createAppRouter(history?, options?: { adminEnabled?: boolean }): Router`; npm command `npm run build:trial`; artifact `dist/public-trial-client/index.html`.

- [ ] **Step 1: Write the failing router test**

```ts
// test/web/public-trial-router.test.ts
import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../../web/router.js';

describe('public trial router', () => {
  it('contains only deck and chat when admin is disabled', () => {
    const router = createAppRouter(createMemoryHistory(), { adminEnabled: false });
    expect(router.getRoutes().map((route) => route.path).sort()).toEqual(['/', '/chat']);
  });

  it('keeps admin enabled for the normal local build', () => {
    const router = createAppRouter(createMemoryHistory(), { adminEnabled: true });
    expect(router.getRoutes().map((route) => route.path)).toContain('/admin');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
Set-Location apps\freshman-mvp
npm exec -- vitest run test/web/public-trial-router.test.ts
```

Expected: FAIL because `createAppRouter` does not accept the options argument and always includes `/admin`.

- [ ] **Step 3: Make admin routing optional and lazy-loaded**

```ts
// web/router.ts
import type { RouteRecordRaw } from 'vue-router';

export interface AppRouterOptions {
  adminEnabled?: boolean;
}

export function createAppRouter(
  history: RouterHistory = createWebHistory(),
  options: AppRouterOptions = {},
): Router {
  const adminEnabled = options.adminEnabled
    ?? import.meta.env.MODE !== 'public-trial';
  const routes: RouteRecordRaw[] = [
    { path: '/', name: 'deck', component: QuestionDeckView },
    { path: '/chat', name: 'chat', component: ChatView },
  ];
  if (adminEnabled) {
    routes.push({
      path: '/admin',
      name: 'admin',
      component: () => import('./views/AdminView.vue'),
    });
  }
  return createRouter({ history, routes });
}
```

Remove the static `AdminView` import. In `vite.config.ts`, set the output directory to
`../dist/public-trial-client` when `mode === 'public-trial'`; retain the current test and normal build paths.
Add this exact script:

```json
"build:trial": "vue-tsc --noEmit -p tsconfig.json && vite build --mode public-trial"
```

- [ ] **Step 4: Run unit tests and both builds**

Run:

```powershell
npm exec -- vitest run test/web/public-trial-router.test.ts test/web/question-deck.test.ts test/web/admin.test.ts
npm run build
npm run build:trial
```

Expected: all tests pass; both `dist/client/index.html` and `dist/public-trial-client/index.html` exist.

- [ ] **Step 5: Verify the public artifact excludes the admin chunk and copy**

Run:

```powershell
$trial = 'dist\public-trial-client'
if (Select-String -Path "$trial\assets\*.js" -Pattern '内容与审核控制台|/api/admin/intents|/api/reviews' -Quiet) {
    throw 'Public trial bundle contains admin code.'
}
```

Expected: no exception.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- apps/freshman-mvp/web/router.ts apps/freshman-mvp/vite.config.ts apps/freshman-mvp/package.json apps/freshman-mvp/package-lock.json apps/freshman-mvp/test/web/public-trial-router.test.ts
git commit -m "feat: add user-only trial frontend build"
```

---

### Task 2: Add test-code sessions and a strict public gateway

**Files:**
- Create: `apps/freshman-mvp/src/public-trial/config.ts`
- Create: `apps/freshman-mvp/src/public-trial/session.ts`
- Create: `apps/freshman-mvp/src/public-trial/login-page.ts`
- Create: `apps/freshman-mvp/src/public-trial/app.ts`
- Create: `apps/freshman-mvp/src/public-trial/index.ts`
- Create: `apps/freshman-mvp/test/public-trial-config.test.ts`
- Create: `apps/freshman-mvp/test/public-trial-session.test.ts`
- Create: `apps/freshman-mvp/test/public-trial-gateway.test.ts`
- Modify: `apps/freshman-mvp/package.json`

**Interfaces:**
- Consumes: `dist/public-trial-client`, upstream `http://127.0.0.1:3210`, Node `crypto`, Fastify and global `fetch`.
- Produces: `loadPublicTrialConfig(env, appRoot): PublicTrialConfig`; `createSessionToken()`; `verifySessionToken()`; `createPublicTrialApp(deps): FastifyInstance`; npm command `npm run start:trial`.

- [ ] **Step 1: Write failing configuration tests**

Cover these exact cases in `public-trial-config.test.ts`:

```ts
assert.throws(() => loadPublicTrialConfig({}, APP_ROOT), /PUBLIC_TRIAL_ACCESS_CODE/);
assert.throws(() => loadPublicTrialConfig({
  PUBLIC_TRIAL_ACCESS_CODE: '12345678',
  PUBLIC_TRIAL_SESSION_SECRET: 'short',
}, APP_ROOT), /at least 32 characters/);
assert.equal(loadPublicTrialConfig(VALID_ENV, APP_ROOT).host, '127.0.0.1');
assert.equal(loadPublicTrialConfig(VALID_ENV, APP_ROOT).port, 3211);
assert.equal(loadPublicTrialConfig(VALID_ENV, APP_ROOT).upstreamOrigin, 'http://127.0.0.1:3210');
assert.match(loadPublicTrialConfig(VALID_ENV, APP_ROOT).runtimeDir, /^D:\\/i);
```

- [ ] **Step 2: Run the configuration test and verify RED**

Run:

```powershell
npm exec -- tsx --test test/public-trial-config.test.ts
```

Expected: FAIL because `src/public-trial/config.ts` does not exist.

- [ ] **Step 3: Implement strict configuration parsing**

Define:

```ts
export type PublicTrialConfig = Readonly<{
  host: '127.0.0.1';
  port: number;
  upstreamOrigin: 'http://127.0.0.1:3210';
  publicDir: string;
  runtimeDir: string;
  accessCode: string;
  sessionSecret: string;
  sessionTtlSeconds: 43200;
  questionLimit: 30;
  questionWindowMs: 600000;
  maxQuestionCodePoints: 500;
}>;
```

Reject non-loopback hosts/origins, ports outside `1..65535`, access codes shorter than 8 characters,
session secrets shorter than 32 characters and runtime paths not rooted on `D:\`.

- [ ] **Step 4: Write failing HMAC session tests**

Test all of the following:

```ts
assert.equal(matchesAccessCode('team-code', 'team-code'), true);
assert.equal(matchesAccessCode('team-code', 'wrong-code'), false);
assert.equal(verifySessionToken(token, secret, issuedAt + 43_199_000)?.sessionId, 'session-1');
assert.equal(verifySessionToken(token, secret, issuedAt + 43_201_000), null);
assert.equal(verifySessionToken(`${token}tampered`, secret, issuedAt), null);
```

- [ ] **Step 5: Implement dependency-free signed sessions**

Use `createHmac('sha256', secret)`, `timingSafeEqual`, base64url payloads and this payload shape:

```ts
export interface TrialSessionPayload {
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}
```

Expose `serializeSessionCookie(token)` with exact attributes
`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200` and
`clearSessionCookie()` with `Max-Age=0`.

- [ ] **Step 6: Write failing gateway access and whitelist tests**

Create the gateway with a temporary public directory and stubbed `fetch`. Verify:

```ts
assert.equal((await app.inject({ method: 'GET', url: '/' })).statusCode, 302);
assert.equal((await app.inject({ method: 'POST', url: '/trial/login', payload: { code: 'wrong' } })).statusCode, 401);
assert.equal(validLogin.statusCode, 200);
assert.match(validLogin.headers['set-cookie'], /HttpOnly.*Secure.*SameSite=Lax/);
assert.equal((await authenticated('GET', '/')).statusCode, 200);
assert.equal((await authenticated('GET', '/chat')).statusCode, 200);
assert.equal((await authenticated('GET', '/api/questions')).statusCode, 200);
assert.equal((await authenticated('POST', '/api/ask', { question: '学校怎么办校园卡' })).statusCode, 200);
```

For each forbidden path below, assert status 404 and assert the upstream `fetch` stub was not called:

```ts
['/admin', '/api/admin/intents', '/api/reviews', '/api/health', '/unknown']
```

- [ ] **Step 7: Implement the public gateway**

`createPublicTrialApp` must accept injectable time, UUID and fetch functions:

```ts
export interface PublicTrialDependencies {
  config: PublicTrialConfig;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  randomUUID?: () => string;
  writeLog?: (entry: TrialLogEntry) => void;
}
```

Serve login HTML from `login-page.ts`. Serve `index.html` for authenticated `GET /` and
`GET /chat`; serve only files below `/assets/` plus `/favicon.svg`. Proxy only the two API routes,
copy only `content-type`, `accept` and `x-request-id` request headers, and return only safe upstream
status, content type and body. Do not forward cookies, authorization headers, client-supplied
forwarded headers or arbitrary upstream headers.

- [ ] **Step 8: Add the production entrypoint**

`index.ts` loads `.env.local` through the same restricted key/value parsing pattern already used by
the platform scripts, creates the runtime log directory, listens only on `127.0.0.1:3211`, handles
`SIGINT`/`SIGTERM`, and prints only:

```text
LIVE IN HDU 公网内测网关：http://127.0.0.1:3211
```

Add:

```json
"start:trial": "node --preserve-symlinks --preserve-symlinks-main dist/server/public-trial/index.js"
```

- [ ] **Step 9: Run focused tests and the production build**

Run:

```powershell
npm exec -- tsx --test test/public-trial-config.test.ts test/public-trial-session.test.ts test/public-trial-gateway.test.ts
npm run build
npm run build:trial
```

Expected: all focused tests pass and both server and user-only client artifacts exist.

- [ ] **Step 10: Commit Task 2**

```powershell
git add -- apps/freshman-mvp/src/public-trial apps/freshman-mvp/test/public-trial-config.test.ts apps/freshman-mvp/test/public-trial-session.test.ts apps/freshman-mvp/test/public-trial-gateway.test.ts apps/freshman-mvp/package.json
git commit -m "feat: add authenticated public trial gateway"
```

---

### Task 3: Add bounded questions, per-session limits and secret-safe logs

**Files:**
- Create: `apps/freshman-mvp/src/public-trial/rate-limit.ts`
- Modify: `apps/freshman-mvp/src/public-trial/app.ts`
- Modify: `apps/freshman-mvp/src/public-trial/index.ts`
- Modify: `apps/freshman-mvp/test/public-trial-gateway.test.ts`

**Interfaces:**
- Consumes: verified `TrialSessionPayload`, `PublicTrialConfig` and `POST /api/ask` proxy.
- Produces: `FixedWindowLimiter.consume(sessionId, now): { allowed: boolean; remaining: number; retryAfterSeconds: number }`; JSON-line `TrialLogEntry` records.

- [ ] **Step 1: Add failing abuse-boundary tests**

Use a fixed clock and separate authenticated sessions for the length and rate-limit cases. Verify:

```ts
assert.equal((await ask({ question: '问'.repeat(500) })).statusCode, 200);
assert.equal((await ask({ question: '问'.repeat(501) })).statusCode, 400);
assert.equal((await askWithContentType('text/plain')).statusCode, 415);
for (let index = 0; index < 30; index += 1) assert.equal((await askValid(rateSession)).statusCode, 200);
assert.equal((await askValid(rateSession)).statusCode, 429);
clock.advance(600_001);
assert.equal((await askValid(rateSession)).statusCode, 200);
```

Also assert that rejected `400`、`415` and `429` requests never call the upstream.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm exec -- tsx --test test/public-trial-gateway.test.ts
```

Expected: FAIL because the gateway lacks Unicode length and rate-limit enforcement.

- [ ] **Step 3: Implement the fixed-window limiter**

Use an in-memory `Map<string, { startedAt: number; count: number }>` keyed only by signed session ID.
Delete expired windows during `consume`; do not key by untrusted `X-Forwarded-For`. Return 429 with:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "测试请求较多，请稍后再试"
  }
}
```

Set `Retry-After` to the returned whole seconds.

- [ ] **Step 4: Add question validation before proxying**

Require `Content-Type: application/json`, parse an object body, trim `question`, and count
`[...question].length`. Return safe 400 JSON for blank or over-500-code-point questions. Preserve
`context` and `requestId` only when they already have the shapes accepted by the upstream; never add
or synthesize an answer at the gateway.

- [ ] **Step 5: Add JSON-line operational logging**

Define:

```ts
export interface TrialLogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}
```

Append to `D:\Star\LIVE_IN_HDU_RUNTIME\public-trial\logs\gateway.jsonl`. Test that a request
containing sentinel strings in code, cookie, question and authorization header produces no sentinel
match in serialized logs.

- [ ] **Step 6: Run focused and full backend tests**

Run:

```powershell
npm exec -- tsx --test test/public-trial-gateway.test.ts
npm test
```

Expected: focused tests and the complete backend suite pass with only the existing explicit live skips.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- apps/freshman-mvp/src/public-trial/rate-limit.ts apps/freshman-mvp/src/public-trial/app.ts apps/freshman-mvp/src/public-trial/index.ts apps/freshman-mvp/test/public-trial-gateway.test.ts
git commit -m "feat: protect public trial usage and logs"
```

---

### Task 4: Add D-drive lifecycle and isolation scripts

**Files:**
- Modify: `apps/freshman-mvp/.env.example`
- Create: `scripts/start-public-trial.ps1`
- Create: `scripts/stop-public-trial.ps1`
- Create: `scripts/test-public-trial.ps1`
- Create: `apps/freshman-mvp/test/public-trial-scripts.test.ts`
- Modify: `scripts/stop-knowledge-stack.ps1`
- Modify: `apps/freshman-mvp/test/lifecycle-scripts.test.ts`

**Interfaces:**
- Consumes: built gateway entrypoint, `.env.local`, existing `start-knowledge-stack.ps1` and `3210` health endpoint.
- Produces: `D:\Star\LIVE_IN_HDU_RUNTIME\public-trial\gateway.pid.json`, logs, `start-public-trial.ps1`, `stop-public-trial.ps1`, `test-public-trial.ps1`.

- [ ] **Step 1: Write failing script safety tests**

The tests must read scripts as text and run their static modes. Assert:

```ts
assert.match(startScript, /127\.0\.0\.1/);
assert.match(startScript, /3211/);
assert.match(startScript, /D:\\Star\\LIVE_IN_HDU_RUNTIME/);
assert.doesNotMatch(stopScript, /down\s+-v|Remove-Item.+postgres|Remove-Item.+weknora/is);
assert.match(stopKnowledgeScript, /stop-public-trial\.ps1/);
```

Add `-StaticOnly` to all three new scripts and assert their JSON output reports no process start,
no firewall mutation and D-drive runtime paths.

- [ ] **Step 2: Run script tests and verify RED**

Run:

```powershell
Set-Location apps\freshman-mvp
npm exec -- tsx --test test/public-trial-scripts.test.ts test/lifecycle-scripts.test.ts
```

Expected: FAIL because the new scripts do not exist and the full stop script does not stop the trial first.

- [ ] **Step 3: Add the environment template**

Append blank/default values only:

```dotenv
PUBLIC_TRIAL_HOST=127.0.0.1
PUBLIC_TRIAL_PORT=3211
PUBLIC_TRIAL_UPSTREAM=http://127.0.0.1:3210
PUBLIC_TRIAL_RUNTIME_DIR=D:\Star\LIVE_IN_HDU_RUNTIME\public-trial
PUBLIC_TRIAL_ACCESS_CODE=
PUBLIC_TRIAL_SESSION_SECRET=
```

- [ ] **Step 4: Implement safe start and stop scripts**

`start-public-trial.ps1` must:

1. Verify the runtime root is on D and create `public-trial\logs`, `public-trial\cpolar` and
   `public-trial\artifacts`.
2. Import `.env.local` without echoing values.
3. Require a running healthy `http://127.0.0.1:3210/api/health`.
4. Require nonempty test code and 32-character session secret.
5. Run `npm run build:trial` and the server TypeScript build with TEMP/npm cache on D.
6. Start the exact `dist\server\public-trial\index.js` entrypoint hidden.
7. Persist PID, entrypoint, port and runtime path but no secret.
8. Wait for local `3211` to return the login redirect.

`stop-public-trial.ps1` must validate the PID command line and exact entrypoint before stopping it,
remove only stale PID metadata, and preserve logs/config/artifacts. Both scripts must be idempotent.

- [ ] **Step 5: Implement local boundary verification**

`test-public-trial.ps1` accepts `-BaseUrl` defaulting to `http://127.0.0.1:3211` and a
`-CookieHeader` that is never printed. It checks unauthenticated redirect, authenticated `/` and
`/chat`, both public APIs, and 404 for the four blocked route families. Output one JSON summary with
statuses only.

- [ ] **Step 6: Integrate full-stack stop order**

At the beginning of `stop-knowledge-stack.ps1`, call `stop-public-trial.ps1` before stopping the
gateway, databases or containers. Preserve the existing `-PrintCommandOnly` behavior and add no
volume deletion command.

- [ ] **Step 7: Run lifecycle tests and a real local restart**

Run:

```powershell
Set-Location apps\freshman-mvp
npm exec -- tsx --test test/public-trial-scripts.test.ts test/lifecycle-scripts.test.ts
Set-Location ..\..
.\scripts\start-public-trial.ps1
.\scripts\test-public-trial.ps1
.\scripts\stop-public-trial.ps1
Invoke-RestMethod http://127.0.0.1:3210/api/health
```

Expected: script tests pass; the trial starts and stops; `3210` remains healthy after stopping `3211`.

- [ ] **Step 8: Commit Task 4**

```powershell
git add -- apps/freshman-mvp/.env.example scripts/start-public-trial.ps1 scripts/stop-public-trial.ps1 scripts/test-public-trial.ps1 apps/freshman-mvp/test/public-trial-scripts.test.ts scripts/stop-knowledge-stack.ps1 apps/freshman-mvp/test/lifecycle-scripts.test.ts
git commit -m "feat: add public trial lifecycle scripts"
```

---

### Task 5: Configure cpolar on D and generate the share artifact

**Files:**
- Create: `scripts/configure-public-trial-tunnel.ps1`
- Modify: `scripts/start-public-trial.ps1`
- Modify: `scripts/stop-public-trial.ps1`
- Modify: `scripts/test-public-trial.ps1`
- Create: `apps/freshman-mvp/scripts/generate-public-trial-qr.mts`
- Modify: `apps/freshman-mvp/package.json`
- Modify: `apps/freshman-mvp/package-lock.json`
- Modify: `apps/freshman-mvp/test/public-trial-scripts.test.ts`

**Interfaces:**
- Consumes: manually downloaded official `cpolar.exe`, a cpolar authtoken copied to the Windows clipboard, authenticated local `3211` gateway.
- Produces: ignored `D:\Star\LIVE_IN_HDU_RUNTIME\public-trial\cpolar\cpolar.yml`; temporary HTTPS URL; `public-trial-url.txt`; `public-trial-qr.png`.

- [ ] **Step 1: Write failing tunnel safety tests**

Assert the configure script:

```ts
assert.match(configureScript, /GetText\(\)/);
assert.match(configureScript, /inspect_db_size:\s*-1/);
assert.match(configureScript, /web_addr:\s*127\.0\.0\.1:4040/);
assert.match(configureScript, /addr:\s*3211/);
assert.match(configureScript, /proto:\s*http/);
assert.match(configureScript, /inspect:\s*false/);
assert.doesNotMatch(configureScript, /Write-Output.+authtoken|ConvertTo-Json.+authtoken/is);
```

Also assert cpolar is started with an explicit D-drive `-config` argument and only the named
`live-in-hdu-trial` tunnel.

- [ ] **Step 2: Run script tests and verify RED**

Run:

```powershell
Set-Location apps\freshman-mvp
npm exec -- tsx --test test/public-trial-scripts.test.ts
```

Expected: FAIL because cpolar configuration and QR steps do not exist.

- [ ] **Step 3: Place the official cpolar binary on D**

Open `https://www.cpolar.com/download`, download the Windows 64-bit package, and place the extracted
binary at:

```text
D:\Star\LIVE_IN_HDU_RUNTIME\public-trial\cpolar\cpolar.exe
```

Record the binary version and SHA-256 in
`D:\Star\LIVE_IN_HDU_RUNTIME\public-trial\cpolar\binary-manifest.json`; do not commit the binary.

- [ ] **Step 4: Implement clipboard-only authtoken configuration**

`configure-public-trial-tunnel.ps1 -TokenFromClipboard` reads the current clipboard with
`[Windows.Forms.Clipboard]::GetText()`, rejects blank/multiline values, writes UTF-8 without BOM and
clears the process variable after writing. Generate exactly:

```yaml
authtoken: <clipboard value>
console_ui: false
inspect_db_size: -1
log_level: info
log_format: json
log: D:/Star/LIVE_IN_HDU_RUNTIME/public-trial/logs/cpolar.log
web_addr: 127.0.0.1:4040
tunnels:
  live-in-hdu-trial:
    addr: 3211
    proto: http
    region: cn
    inspect: false
```

The script prints only the config path and a SHA-256 fingerprint of the complete file, never its
contents.

- [ ] **Step 5: Start and stop the named tunnel safely**

Extend the start script to run hidden:

```powershell
& $CpolarExe start -config=$CpolarConfig live-in-hdu-trial
```

In implementation use `Start-Process` with stdout/stderr redirected to D-drive files and store a
separate validated cpolar PID record. Poll the stdout for an `https://` forwarding address, reject
non-HTTPS URLs, save only that address to `public-trial-url.txt`, and never expose the local cpolar
Web UI. The stop script validates the cpolar executable path in the command line before stopping it.

- [ ] **Step 6: Add local QR generation**

Install pinned packages into the D-junctioned `node_modules`:

```powershell
npm install --save-dev qrcode@1.5.4 @types/qrcode@1.5.5
```

Implement:

```ts
import QRCode from 'qrcode';

await QRCode.toFile(outputPath, url, {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 720,
  color: { dark: '#111827', light: '#FFFFFF' },
});
```

Require `https:` and write only below
`D:\Star\LIVE_IN_HDU_RUNTIME\public-trial\artifacts\public-trial-qr.png`.

- [ ] **Step 7: Run tunnel and artifact verification**

After the user copies the cpolar authtoken:

```powershell
.\scripts\configure-public-trial-tunnel.ps1 -TokenFromClipboard
.\scripts\start-public-trial.ps1 -StartTunnel
.\scripts\test-public-trial.ps1 -UseSavedPublicUrl
```

Expected: an HTTPS URL is saved, the PNG signature is valid, the QR is generated from the exact
saved URL, and blocked routes return 404 through the public URL. The phone decoding check is performed
in Task 6.

- [ ] **Step 8: Commit Task 5 without runtime secrets**

```powershell
git add -- scripts/configure-public-trial-tunnel.ps1 scripts/start-public-trial.ps1 scripts/stop-public-trial.ps1 scripts/test-public-trial.ps1 apps/freshman-mvp/scripts/generate-public-trial-qr.mts apps/freshman-mvp/package.json apps/freshman-mvp/package-lock.json apps/freshman-mvp/test/public-trial-scripts.test.ts
git commit -m "feat: add controlled cpolar trial publishing"
```

Before committing, run `git status --short` and confirm no file below the D-drive runtime or any
`.env.local` file is staged.

---

### Task 6: Complete external acceptance and the handoff package

**Files:**
- Create: `docs/PUBLIC_TEAM_TRIAL_RUNBOOK.md`
- Create: `docs/PUBLIC_TEAM_TRIAL_BRIEF.md`
- Create: `docs/PUBLIC_TEAM_TRIAL_FEEDBACK_TEMPLATE.md`
- Create: `docs/TECHNICAL_HANDOFF.md`
- Modify: `docs/PHASE_B_LOCAL_RUNBOOK.md`
- Modify: `docs/SESSION_CHECKPOINT_CURRENT.md`
- Modify: `TASKS.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: verified local and public URLs, QR artifact, start/stop scripts, existing backup and knowledge-stack runbooks.
- Produces: a boss-facing product brief, team testing instructions, technical handoff boundary and an honest resumable checkpoint.

- [ ] **Step 1: Run the complete automated baseline twice**

Run twice from the repository root:

```powershell
.\scripts\test-knowledge-stack.ps1
```

Expected each time: backend, frontend, legacy MVP, production builds, secret scan and live component
health all pass; only documented live skips may remain.

- [ ] **Step 2: Run the public boundary test**

Use `test-public-trial.ps1 -UseSavedPublicUrl` and require:

- login required before `/` and `/chat`;
- correct test code creates a 12-hour secure session;
- 23 published questions are returned;
- one preset question returns an approved answer;
- `/admin`、`/api/admin/intents`、`/api/reviews`、`/api/health` all return 404;
- no response contains a key, database URL, local path or stack trace.

- [ ] **Step 3: Perform real mobile acceptance over 4G/5G**

Turn off Wi-Fi on a phone, scan the generated QR, enter the test code and verify:

1. the title and “新生必看 23 问” load;
2. question navigation and full-answer expansion work;
3. a preset paraphrase such as“学校怎么办校园卡” receives the approved answer;
4. one clearly marked internal-test unknown question receives the required unverified disclaimer and
   appears at the bottom of the local FIFO review queue;
5. refresh preserves access for the active session;
6. mobile viewport has no horizontal overflow and browser console has no error when repeated in
   desktop mobile emulation.

Save screenshots only under
`D:\Star\LIVE_IN_HDU_RUNTIME\public-trial\artifacts\acceptance`.

- [ ] **Step 4: Write the operator runbook**

`PUBLIC_TEAM_TRIAL_RUNBOOK.md` must include exact start, verify, share, rotate-code, stop and recovery
commands; D-drive file locations; sleep/network prerequisites; cpolar random URL lifetime; and a red
box explaining that `3210`, `8080`, `8081`, `8888`, `11434` and PostgreSQL ports must never be
mapped publicly.

- [ ] **Step 5: Write the boss and team materials**

`PUBLIC_TEAM_TRIAL_BRIEF.md` must explain in plain Chinese: product purpose, current 23 questions,
three-stage answers, unverified disclaimer, local-host availability limit, what cloud funding later
covers, and role ownership.

`PUBLIC_TEAM_TRIAL_FEEDBACK_TEMPLATE.md` must contain these columns:

```text
编号 | 测试人 | 手机型号 | 系统与浏览器 | 操作步骤 | 预期结果 | 实际结果 | 截图链接 | 严重程度 | 是否重复 | 处理状态
```

It must also include a short group message telling testers not to enter ID numbers, phone numbers or
other sensitive information.

- [ ] **Step 6: Write the technical handoff boundary**

`TECHNICAL_HANDOFF.md` must separate:

- current developer: content, source, year/campus applicability and approval;
- replacement technician: frontend/backend, cloud deployment, backups, monitoring, accounts and
  incidents;
- boss/team: resource ownership, expenditure approval and acceptance.

List all services and ports, backup locations, Git branch, start/stop entrypoints, ignored secret
files and the future cloud migration prerequisites. Do not include real values.

- [ ] **Step 7: Update current project records honestly**

Update `PHASE_B_LOCAL_RUNBOOK.md`, `SESSION_CHECKPOINT_CURRENT.md`, `TASKS.md` and `CHANGELOG.md`
with the observed URL type, current test counts, external acceptance result and remaining cloud work.
Do not describe a random tunnel as production or 7x24 availability.

- [ ] **Step 8: Run final repository checks**

Run:

```powershell
git diff --check
Set-Location apps\freshman-mvp
npm test
npm run test:web
npm run build
npm run build:trial
Set-Location ..\..
.\scripts\scan-secrets.ps1
git status --short
```

Expected: no failures, no secret findings, and only intended tracked files staged later. Verify Q11
remains unpublished and FAQ outbox pending/failed counts remain zero.

- [ ] **Step 9: Commit Task 6**

```powershell
git add -- docs/PUBLIC_TEAM_TRIAL_RUNBOOK.md docs/PUBLIC_TEAM_TRIAL_BRIEF.md docs/PUBLIC_TEAM_TRIAL_FEEDBACK_TEMPLATE.md docs/TECHNICAL_HANDOFF.md docs/PHASE_B_LOCAL_RUNBOOK.md docs/SESSION_CHECKPOINT_CURRENT.md TASKS.md CHANGELOG.md
git commit -m "docs: complete public trial handoff package"
```

- [ ] **Step 10: Hand off the test package**

Provide the boss with the HTTPS URL, QR image and product brief. Send the test code in a separate
message. Provide the replacement technician with the repository, runbooks and configuration
templates but no personal TokenDance or cpolar secret; those credentials must be rotated into
team-owned accounts during cloud migration.
