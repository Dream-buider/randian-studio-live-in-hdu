# LIVE IN HDU Local Freshman MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-runtime-dependency local mobile Q&A prototype with deterministic three-stage routing and a durable human-review queue.

**Architecture:** A Node.js HTTP server serves a mobile H5 and admin page. JSON repositories provide atomic local persistence; isolated routing/provider modules make the later WeKnora/PostgreSQL migration replaceable without changing the browser API.

**Tech Stack:** Node.js 24 ESM, built-in `node:http`, `node:test`, HTML/CSS/JavaScript.

## Global Constraints

- Exact route order: preset questions, local knowledge, DeepSeek V4 plus web context.
- Every valid question returns an answer object.
- Web-route answers include exactly `该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别`.
- Web-route questions persist in FIFO order with initial status `pending` and label `待审核`.
- Secrets are environment variables and never returned to browsers.

---

### Task 1: Core configuration, matching, and JSON storage

**Files:**
- Create: `apps/freshman-mvp/src/config.mjs`
- Create: `apps/freshman-mvp/src/matching.mjs`
- Create: `apps/freshman-mvp/src/json-store.mjs`
- Test: `apps/freshman-mvp/test/core.test.mjs`

**Interfaces:**
- `loadConfig(env, rootDir): Config`
- `bestMatch(question, entries, threshold): Match | null`
- `JsonStore.read()`, `JsonStore.update(mutator)`

- [ ] Write tests for exact disclaimer, fuzzy matching, no false match, persistence, and monotonic sequence.
- [ ] Run `node --test apps/freshman-mvp/test/core.test.mjs` and confirm failure from missing modules.
- [ ] Implement the minimum modules.
- [ ] Re-run the test and confirm all cases pass.

### Task 2: Three-stage answer router and providers

**Files:**
- Create: `apps/freshman-mvp/src/providers.mjs`
- Create: `apps/freshman-mvp/src/review-repository.mjs`
- Create: `apps/freshman-mvp/src/answer-router.mjs`
- Test: `apps/freshman-mvp/test/router.test.mjs`

**Interfaces:**
- `AnswerRouter.answer(question): AnswerResult`
- `ReviewRepository.enqueue`, `list`, `decide`
- `DeepSeekProvider.answer(question, webContext)`

- [ ] Write route tests for preset, knowledge, web, disclaimer, FIFO and offline-admin behavior.
- [ ] Verify tests fail for missing implementations.
- [ ] Implement explicit precedence and demo-mode provider.
- [ ] Add optional DeepSeek `deepseek-v4-flash` Chat Completions call and bounded timeout.
- [ ] Re-run all tests.

### Task 3: HTTP API and static file server

**Files:**
- Create: `apps/freshman-mvp/src/app.mjs`
- Create: `apps/freshman-mvp/server.mjs`
- Test: `apps/freshman-mvp/test/http.test.mjs`

**Interfaces:**
- `createApp(options): http.RequestListener`
- `GET /api/health`
- `POST /api/ask`
- `GET /api/reviews`
- `PATCH /api/reviews/:id`

- [ ] Write HTTP injection tests for validation, three routes, FIFO list and decisions.
- [ ] Verify tests fail.
- [ ] Implement JSON request/response helpers, size limits and safe static serving.
- [ ] Re-run all tests.

### Task 4: Mobile H5 and admin review UI

**Files:**
- Create: `apps/freshman-mvp/public/index.html`
- Create: `apps/freshman-mvp/public/admin.html`
- Create: `apps/freshman-mvp/public/styles.css`
- Create: `apps/freshman-mvp/public/app.js`
- Create: `apps/freshman-mvp/public/admin.js`
- Test: `apps/freshman-mvp/test/ui-contract.test.mjs`

- [ ] Write static contract tests for required forms, exact disclaimer rendering hook and admin action controls.
- [ ] Verify tests fail.
- [ ] Implement responsive H5 and oldest-first admin cards.
- [ ] Re-run all tests.

### Task 5: Seed data, launch script, and browser verification

**Files:**
- Create: `apps/freshman-mvp/data/presets.json`
- Create: `apps/freshman-mvp/data/knowledge.json`
- Create: `apps/freshman-mvp/data/reviews.json`
- Create: `apps/freshman-mvp/.env.example`
- Create: `apps/freshman-mvp/README.md`
- Create: `scripts/start-freshman-mvp.ps1`
- Test: `apps/freshman-mvp/test/e2e-smoke.mjs`

- [ ] Seed clearly labeled sample content and an empty review queue.
- [ ] Add a PowerShell launcher that prints both localhost and LAN URLs.
- [ ] Run the full test suite.
- [ ] Start the app, call health/preset/knowledge/web/admin flows, and verify persistence after restart.
- [ ] Open both pages with Playwright at mobile and desktop sizes and save screenshots.

### Task 6: Project records

**Files:**
- Modify: `README.md`
- Modify: `TASKS.md`
- Modify: `CHANGELOG.md`

- [ ] Record the exact implemented scope, verification evidence and remaining real-data credentials.
- [ ] Confirm no API key or secret was added to tracked files.
