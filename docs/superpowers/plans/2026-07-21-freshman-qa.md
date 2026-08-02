# LIVE IN HDU Freshman QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 10 天内交付手机 H5，并让每个问题严格经过“40 题、社区知识库、DeepSeek 联网”三段路由，第三段问题进入可持续审核回流队列。

**Architecture:** 保留固定版本的 WeKnora 作为 RAG、FAQ、飞书同步、模型与联网搜索底座；新增 TypeScript/Fastify 薄网关控制路由和审核状态；新增 Vue 3 手机端与审核端。PostgreSQL 保存审核队列，API Key 永远只存在服务端。

**Tech Stack:** WeKnora `150c073`, Docker Compose, PostgreSQL, TypeScript, Fastify, Kysely, Vitest, Vue 3, Vite, Playwright, Caddy.

## Global Constraints

- 用户提问必须返回响应；不得向用户输出“未收录”“无法回答”或同类拒绝话术。
- 三段优先级固定为：40 个预设问题、LIVE IN HDU 知识库、DeepSeek + 全网搜索。
- 第三段逐字追加：`该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别`。
- 第三段问题必须持久化并以 `created_at ASC, ordinal ASC` 默认展示，状态初始值为 `pending`，中文为“待审核”。
- 管理员离线不得阻塞用户答案；审核和回流为回答后的独立流程。
- 40 题 ID、知识库 ID、模型 ID、阈值、超时和批注文案均从配置读取，不散落在业务代码中。
- 上游 MIT 许可和第三方许可文件必须保留。

---

## File Map

| Path | Responsibility |
| --- | --- |
| `vendor/WeKnora/` | 固定版本的上游能力底座 |
| `apps/freshman-gateway/src/config.ts` | 环境配置和 Zod 校验 |
| `apps/freshman-gateway/src/weknora/client.ts` | WeKnora API/SSE 客户端 |
| `apps/freshman-gateway/src/answer/router.ts` | 唯一的三段路由实现 |
| `apps/freshman-gateway/src/reviews/repository.ts` | 审核队列持久化与 FIFO 查询 |
| `apps/freshman-gateway/src/reviews/routes.ts` | 管理员审核 API |
| `apps/freshman-gateway/src/reviews/publisher.ts` | 审核通过后写回 FAQ/飞书 |
| `apps/freshman-gateway/migrations/001_review_items.sql` | 队列表和约束 |
| `apps/freshman-web/src/views/AskView.vue` | 手机问答页 |
| `apps/freshman-web/src/views/ReviewView.vue` | 审核列表和审核动作 |
| `deploy/docker-compose.liveinhdu.yml` | WeKnora、网关和 Web 组合部署 |
| `deploy/Caddyfile` | HTTPS 与公网/管理面隔离 |

---

### Task 1: Scaffold gateway with validated configuration

**Files:**
- Create: `apps/freshman-gateway/package.json`
- Create: `apps/freshman-gateway/tsconfig.json`
- Create: `apps/freshman-gateway/src/config.ts`
- Test: `apps/freshman-gateway/test/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(env): AppConfig`
- `AppConfig` includes `weknoraBaseUrl`, `weknoraApiKey`, `presetKbId`, `communityKbIds`, `webAgentId`, `deepseekModelId`, `presetThreshold`, `kbThreshold`, `reviewDisclaimer`, `databaseUrl`.

- [ ] **Step 1: Write a failing configuration test**

```ts
expect(() => loadConfig({})).toThrow(/WEKNORA_BASE_URL/)
expect(loadConfig(validEnv).reviewDisclaimer).toBe(
  '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别'
)
```

- [ ] **Step 2: Verify the test fails**

Run: `npm --prefix apps/freshman-gateway test -- config.test.ts`

Expected: FAIL because `loadConfig` does not exist.

- [ ] **Step 3: Implement a Zod-validated immutable config object**

```ts
export const DEFAULT_DISCLAIMER =
  '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别'

export type AppConfig = Readonly<{
  weknoraBaseUrl: string
  weknoraApiKey: string
  presetKbId: string
  communityKbIds: string[]
  webAgentId: string
  deepseekModelId: string
  presetThreshold: number
  kbThreshold: number
  reviewDisclaimer: string
  databaseUrl: string
}>
```

- [ ] **Step 4: Run tests**

Run: `npm --prefix apps/freshman-gateway test`

Expected: PASS.

---

### Task 2: Implement the narrow WeKnora client

**Files:**
- Create: `apps/freshman-gateway/src/weknora/client.ts`
- Create: `apps/freshman-gateway/src/weknora/types.ts`
- Test: `apps/freshman-gateway/test/weknora-client.test.ts`

**Interfaces:**
- Produces: `searchPreset(query)`, `searchKnowledge(query)`, `answerFromKnowledge(query)`, `answerFromWeb(query)`, `createFaq(entry)`.
- `answerFromWeb` calls `/api/v1/agent-chat/:session_id` with `agent_enabled=true`, `web_search_enabled=true`, `agent_id=webAgentId`, and `summary_model_id=deepseekModelId`.

- [ ] **Step 1: Write HTTP contract tests with mocked fetch**

```ts
await client.searchPreset('宿舍几人间')
expect(fetchMock.lastCall()?.url).toContain('/faq/search')
expect(fetchMock.lastCall()?.body).toMatchObject({
  query_text: '宿舍几人间',
  match_count: 1,
  only_recommended: true
})
```

- [ ] **Step 2: Verify tests fail**

Run: `npm --prefix apps/freshman-gateway test -- weknora-client.test.ts`

Expected: FAIL because `WeKnoraClient` does not exist.

- [ ] **Step 3: Implement only the five required methods and SSE answer accumulation**

```ts
export type AnswerEvidence = {
  title: string
  url?: string
  score?: number
  sourceType: 'preset' | 'knowledge' | 'web'
}

export type ModelAnswer = {
  text: string
  evidence: AnswerEvidence[]
}
```

- [ ] **Step 4: Assert API keys never appear in serialized errors or responses**

Run: `npm --prefix apps/freshman-gateway test`

Expected: PASS and no captured snapshot contains `X-API-Key` values.

---

### Task 3: Create the durable FIFO review queue

**Files:**
- Create: `apps/freshman-gateway/migrations/001_review_items.sql`
- Create: `apps/freshman-gateway/src/reviews/repository.ts`
- Test: `apps/freshman-gateway/test/review-repository.test.ts`

**Interfaces:**
- Produces: `enqueueReview(input): ReviewItem`, `listReviews(filter): ReviewItem[]`, `decideReview(id, decision): ReviewItem`.

- [ ] **Step 1: Write repository tests for persistence and order**

```ts
const first = await repo.enqueueReview({ question: 'q1', answer: 'a1', sources: [] })
const second = await repo.enqueueReview({ question: 'q2', answer: 'a2', sources: [] })
expect((await repo.listReviews({ status: 'pending' })).map(x => x.id))
  .toEqual([first.id, second.id])
expect(first.status).toBe('pending')
expect(first.ordinal).toBeLessThan(second.ordinal)
```

- [ ] **Step 2: Create the SQL migration**

```sql
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TABLE review_items (
  id uuid PRIMARY KEY,
  ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  question text NOT NULL,
  normalized_question text NOT NULL,
  web_answer text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  status review_status NOT NULL DEFAULT 'pending',
  risk_level text NOT NULL DEFAULT 'normal',
  final_answer text,
  reviewer_id text,
  reviewed_at timestamptz,
  published_faq_seq_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_items_fifo ON review_items(status, created_at, ordinal);
```

- [ ] **Step 3: Implement FIFO queries without a hard-coded count**

The default SQL ends with `ORDER BY created_at ASC, ordinal ASC`; display labels are derived at response time and do not become identifiers.

- [ ] **Step 4: Run migration and repository tests against test PostgreSQL**

Run: `npm --prefix apps/freshman-gateway run test:db`

Expected: PASS.

---

### Task 4: Implement the deterministic three-stage answer router

**Files:**
- Create: `apps/freshman-gateway/src/answer/router.ts`
- Create: `apps/freshman-gateway/src/answer/types.ts`
- Test: `apps/freshman-gateway/test/answer-router.test.ts`

**Interfaces:**
- Consumes: `WeKnoraClient`, `ReviewRepository`, `AppConfig`.
- Produces: `answer(question, requestId): Promise<AnswerResult>`.

```ts
export type AnswerRoute = 'preset' | 'knowledge' | 'web'
export type AnswerResult = {
  requestId: string
  route: AnswerRoute
  answer: string
  disclaimer?: string
  evidence: AnswerEvidence[]
  reviewOrdinal?: number
}
```

- [ ] **Step 1: Write one test for each route and one night/offline-admin test**

```ts
expect((await router.answer('q-preset', 'r1')).route).toBe('preset')
expect((await router.answer('q-kb', 'r2')).route).toBe('knowledge')
const web = await router.answer('q-new', 'r3')
expect(web.route).toBe('web')
expect(web.disclaimer).toBe(DEFAULT_DISCLAIMER)
expect(await reviews.count({ status: 'pending' })).toBe(1)
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm --prefix apps/freshman-gateway test -- answer-router.test.ts`

- [ ] **Step 3: Implement explicit precedence; do not let the Agent choose routing**

```ts
const preset = await client.searchPreset(question)
if (preset.score >= config.presetThreshold) return fromPreset(preset)

const hit = await client.searchKnowledge(question)
if (hit.score >= config.kbThreshold) return client.answerFromKnowledge(question)

const web = await client.answerFromWeb(question)
const review = await reviews.enqueueReview({ question, answer: web.text, sources: web.evidence })
return { route: 'web', answer: web.text, disclaimer: config.reviewDisclaimer,
  evidence: web.evidence, reviewOrdinal: review.ordinal, requestId }
```

- [ ] **Step 4: Add bounded retries and honest degraded response tests**

Test search timeout, model timeout and database retry. A degraded answer must keep the disclaimer and must not invent a source URL.

- [ ] **Step 5: Run all gateway tests**

Run: `npm --prefix apps/freshman-gateway test`

Expected: PASS.

---

### Task 5: Expose public answer and protected review APIs

**Files:**
- Create: `apps/freshman-gateway/src/server.ts`
- Create: `apps/freshman-gateway/src/routes/answers.ts`
- Create: `apps/freshman-gateway/src/reviews/routes.ts`
- Test: `apps/freshman-gateway/test/routes.test.ts`

**Interfaces:**
- Public: `POST /v1/answers` with `{question}`.
- Admin: `GET /v1/admin/reviews?status=pending`, `PATCH /v1/admin/reviews/:id`.

- [ ] **Step 1: Write injection tests for validation, rate limits and admin authorization**

```ts
expect((await app.inject({ method: 'POST', url: '/v1/answers', payload: { question: '' } })).statusCode).toBe(400)
expect((await app.inject({ method: 'GET', url: '/v1/admin/reviews' })).statusCode).toBe(401)
```

- [ ] **Step 2: Implement routes and response schemas**

`PATCH` accepts exactly `{status: 'approved'|'rejected', finalAnswer?: string}`. Approval requires a non-empty final answer and reviewer identity.

- [ ] **Step 3: Confirm FIFO and Chinese display fields**

Admin response includes `ordinal`, `displayLabel` such as `第一个未收录`, `status='pending'`, and `statusLabel='待审核'`; it does not hard-code how many rows exist.

- [ ] **Step 4: Run route tests**

Run: `npm --prefix apps/freshman-gateway test -- routes.test.ts`

Expected: PASS.

---

### Task 6: Publish approved answers back to knowledge

**Files:**
- Create: `apps/freshman-gateway/src/reviews/publisher.ts`
- Create: `apps/freshman-gateway/src/reviews/worker.ts`
- Test: `apps/freshman-gateway/test/review-publisher.test.ts`

**Interfaces:**
- Consumes: approved `ReviewItem`.
- Produces: WeKnora FAQ entry tagged `reviewed-freshman-2026`, optional Feishu publish job, and `published_faq_seq_id`.

- [ ] **Step 1: Write idempotency tests**

```ts
await publisher.publish(item)
await publisher.publish(item)
expect(weknora.createFaq).toHaveBeenCalledTimes(1)
expect((await repo.get(item.id)).publishedFaqSeqId).toBe(42)
```

- [ ] **Step 2: Implement an outbox-style worker**

Approved rows with no `published_faq_seq_id` are claimed in ordinal order. A failed Feishu sync leaves the approved record intact and retries with backoff; it never changes the user-visible historical answer.

- [ ] **Step 3: Run retry and crash-recovery tests**

Run: `npm --prefix apps/freshman-gateway test -- review-publisher.test.ts`

Expected: PASS and no duplicate FAQ entry.

---

### Task 7: Build the mobile H5 and review screen

**Files:**
- Create: `apps/freshman-web/package.json`
- Create: `apps/freshman-web/src/views/AskView.vue`
- Create: `apps/freshman-web/src/views/ReviewView.vue`
- Create: `apps/freshman-web/src/components/AnswerCard.vue`
- Create: `apps/freshman-web/src/components/ReviewCard.vue`
- Test: `apps/freshman-web/src/**/*.spec.ts`
- Test: `tests/e2e/freshman-qa.spec.ts`

**Interfaces:**
- Consumes gateway APIs from Tasks 5-6.

- [ ] **Step 1: Write component tests for all three answer routes**

The web route test must assert the exact disclaimer is visible beneath the answer and cannot be dismissed as a source citation.

- [ ] **Step 2: Build a one-screen mobile question flow**

The first screen contains quick questions, input, send button and recent answers. It does not expose WeKnora tenant settings or API Key fields from the upstream mini-program.

- [ ] **Step 3: Build the FIFO review screen**

Default sort is oldest first; cards show display label, question, generated answer, sources, risk, created time and approve/edit/reject actions.

- [ ] **Step 4: Run unit and Playwright mobile viewport tests**

Run: `npm --prefix apps/freshman-web test && npx playwright test tests/e2e/freshman-qa.spec.ts`

Expected: PASS at 390×844 and 430×932 viewports.

---

### Task 8: Deploy a production-safe first release

**Files:**
- Create: `deploy/docker-compose.liveinhdu.yml`
- Create: `deploy/Caddyfile`
- Create: `deploy/.env.production.example`
- Create: `scripts/smoke-freshman-qa.ps1`

**Interfaces:**
- Publicly exposes only `/` and `/api/v1/answers` through HTTPS.
- Admin routes require identity and are IP/VPN restricted until full SSO is ready.

- [ ] **Step 1: Compose WeKnora, PostgreSQL, Redis, gateway, web and Caddy**

Pin images or build from the fixed local commit. Do not publish PostgreSQL, Redis or WeKnora admin ports to the public host.

- [ ] **Step 2: Configure health checks and restart policies**

Gateway readiness requires PostgreSQL and WeKnora API; liveness does not call DeepSeek or the search provider.

- [ ] **Step 3: Run the smoke script**

```powershell
./scripts/smoke-freshman-qa.ps1 -BaseUrl https://ask.example.cn
```

Expected: preset, knowledge and web fixtures each return HTTP 200; the web fixture contains the exact disclaimer and creates one pending review row.

- [ ] **Step 4: Run a 30-minute offline-admin soak**

Send at least 100 mixed questions while no reviewer session is active. Expected: no lost review row, default list is ordinal ascending, and answer success rate meets the agreed launch SLO.

---

### Task 9: Adapt and submit the existing WeChat mini-program without blocking H5

**Files:**
- Modify: `vendor/WeKnora/miniprogram/pages/chat/*`
- Modify: `vendor/WeKnora/miniprogram/pages/index/*`
- Modify: `vendor/WeKnora/miniprogram/utils/config.js`
- Test: `vendor/WeKnora/tests/miniprogram/miniprogram.test.js`

**Interfaces:**
- The mini-program calls only the public gateway, never the WeKnora tenant API directly.

- [ ] **Step 1: Change the upstream settings-oriented client into a fixed LIVE IN HDU client**

Remove user-entered API endpoint/API key/knowledge-base selection from production pages. Store no server secret in the code package.

- [ ] **Step 2: Add the three-route answer rendering and exact disclaimer**

Reuse the same gateway response schema as H5 so platform behavior cannot drift.

- [ ] **Step 3: Run upstream mini-program tests and WeChat DevTools preview**

Run: `npm --prefix vendor/WeKnora/miniprogram test`

Expected: PASS; preview can complete one question over the configured HTTPS request domain.

- [ ] **Step 4: Submit review in parallel**

Complete AppID, privacy declaration, service category, request-domain allowlist, screenshots and reviewer test account. H5 launch proceeds even if this review is pending or rejected.

---

## Self-Review Results

- Spec coverage: all three routes, mandatory answer, exact warning, durable chronological review queue, pending status, admin-offline behavior and knowledge feedback each map to a task.
- Placeholder scan: every implementation step specifies a concrete action and handler.
- Type consistency: `AnswerResult`, `AnswerEvidence`, `ReviewItem` and the gateway API schema are produced once and consumed consistently.
- Known infrastructure blocker: the current Windows machine has Node.js but no Docker; Tasks 1-7 unit work can begin, while full integration and Task 8 require Docker Desktop or a Linux cloud host.
