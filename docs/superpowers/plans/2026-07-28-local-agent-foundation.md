# LIVE IN HDU Local Agent Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable mobile question-card experience, operations console, SQLite content workflow, TokenDance model integration, and persistent three-stage review flow on the current Windows computer.

**Architecture:** Evolve `apps/freshman-mvp/` in place into a TypeScript Fastify application with a Vue 3/Vite client. Use Node.js 24 built-in `node:sqlite` behind repository interfaces so the same domain services can move to PostgreSQL in Phase B. Preserve the existing `.mjs` MVP until the new tests and browser smoke test pass, then retire the legacy entrypoint.

**Tech Stack:** Node.js 24, TypeScript, Fastify, Vue 3, Vite, TDesign Mobile Vue, TDesign Vue Next, SQLite via `node:sqlite`, Node test runner, Vitest, Playwright Core, TokenDance OpenAI-compatible API.

## Global Constraints

- The public client must never receive `TOKENDANCE_API_KEY` or any provider credential.
- The number of active questions is data-driven and must not be constrained to 35 or 40.
- Only a published canonical answer may display the `已审核标准答案` label.
- The web fallback must always return the exact disclaimer `该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别`.
- A web/model fallback must persist its review item before returning success.
- Pending reviews sort by `created_at ASC, ordinal ASC`; administrator availability must not block answers.
- Phase A runs without Docker and uses SQLite; WeKnora, PostgreSQL, and independent web search are Phase B.
- Frontend question order is: configured top 10 first, then remaining active questions by category and display order.
- Question cards show an 80–150 Chinese-character summary and allow expansion to the complete answer.
- User questions start in a bottom sheet and continue on a full-screen chat route with the current card as context.
- Work on the existing project carefully; do not overwrite unrelated files or credentials.

---

## File Structure

Create or evolve the application into:

```text
apps/freshman-mvp/
├── package.json
├── tsconfig.json
├── tsconfig.server.json
├── vite.config.ts
├── .env.example
├── server.mjs                       # temporary compatibility launcher
├── src/
│   ├── domain/
│   │   ├── models.ts
│   │   └── errors.ts
│   ├── db/
│   │   ├── sqlite.ts
│   │   └── migrations.ts
│   ├── repositories/
│   │   ├── contracts.ts
│   │   ├── sqlite-content-repository.ts
│   │   └── sqlite-review-repository.ts
│   ├── services/
│   │   ├── content-importer.ts
│   │   ├── intent-matcher.ts
│   │   ├── answer-router.ts
│   │   └── content-review-service.ts
│   ├── providers/
│   │   ├── contracts.ts
│   │   ├── tokendance-provider.ts
│   │   ├── local-knowledge-provider.ts
│   │   └── unavailable-search-provider.ts
│   └── server/
│       ├── config.ts
│       ├── app.ts
│       └── index.ts
├── web/
│   ├── env.d.ts
│   ├── main.ts
│   ├── App.vue
│   ├── router.ts
│   ├── api.ts
│   ├── styles/tokens.css
│   ├── components/
│   │   ├── QuestionCard.vue
│   │   ├── QuestionCatalog.vue
│   │   ├── AskSheet.vue
│   │   └── SourceBadge.vue
│   └── views/
│       ├── QuestionDeckView.vue
│       ├── ChatView.vue
│       └── AdminView.vue
├── scripts/
│   ├── import-feishu-xlsx.mts
│   └── backup-sqlite.mts
└── test/
    ├── sqlite-repositories.test.ts
    ├── content-importer.test.ts
    ├── answer-router-v2.test.ts
    ├── api-v2.test.ts
    ├── tokendance-provider.test.ts
    └── web/
        ├── question-deck.test.ts
        └── admin.test.ts
```

Root support files:

```text
.gitignore
package.json
scripts/start-freshman-platform.ps1
scripts/stop-freshman-platform.ps1
scripts/test-freshman-platform.ps1
output/freshman-platform/              # runtime only; ignored
```

---

### Task 1: Establish a Safe TypeScript Application Baseline

**Files:**
- Create: `.gitignore`
- Create: `apps/freshman-mvp/package.json`
- Create: `apps/freshman-mvp/tsconfig.json`
- Create: `apps/freshman-mvp/tsconfig.server.json`
- Create: `apps/freshman-mvp/vite.config.ts`
- Modify: `package.json`
- Modify: `apps/freshman-mvp/.env.example`
- Test: `apps/freshman-mvp/test/baseline.test.ts`

**Interfaces:**
- Consumes: Existing `apps/freshman-mvp/` source and root Node.js 24 runtime.
- Produces: `npm run dev`, `npm run build`, `npm test`, `npm run test:web`; a typed module boundary for all later tasks.

- [x] **Step 1: Protect runtime and credential files before initializing Git**

Create `.gitignore` with:

```gitignore
node_modules/
apps/freshman-mvp/node_modules/
apps/freshman-mvp/dist/
apps/freshman-mvp/runtime/
apps/freshman-mvp/.env.local
output/
.pw-edge-profile/
.superpowers/
*.log
```

- [x] **Step 2: Recover the empty Git metadata and record the design baseline**

Run:

```powershell
git init
git add .gitignore docs/superpowers/specs/2026-07-28-local-knowledge-agent-platform-design.md docs/superpowers/plans/2026-07-28-local-agent-foundation.md
git commit -m "docs: define local freshman agent platform"
```

Expected: a new local repository exists and no `.env.local`, browser profile, runtime database, or output file is staged.

- [x] **Step 3: Write a failing Node-version and configuration test**

Create `apps/freshman-mvp/test/baseline.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/server/config.js';

test('requires Node 24 and defaults to a local SQLite runtime', () => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24);
  const config = loadConfig({}, 'C:/project/apps/freshman-mvp');
  assert.equal(config.port, 3210);
  assert.match(config.databasePath, /runtime[\\/]live-in-hdu\.db$/);
  assert.equal(config.modelId, 'deepseek-v4-flash');
  assert.equal(config.modelEnabled, false);
});
```

- [x] **Step 4: Run the test and verify the missing TypeScript config module fails**

Run:

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="requires Node 24"
```

Expected: FAIL because `src/server/config.ts` and the application package do not exist.

- [x] **Step 5: Create the application package and compiler configuration**

Create `apps/freshman-mvp/package.json` with scripts:

```json
{
  "name": "@live-in-hdu/freshman-platform",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server/index.ts",
    "dev:web": "vite",
    "build": "vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.server.json && vite build",
    "start": "node dist/server/index.js",
    "test": "tsx --test test/*.test.ts",
    "test:web": "vitest run test/web",
    "test:all": "npm test && npm run test:web"
  },
  "dependencies": {
    "@fastify/static": "^8",
    "fastify": "^5",
    "tdesign-mobile-vue": "^1",
    "tdesign-vue-next": "^1",
    "vue": "^3",
    "vue-router": "^4"
  },
  "devDependencies": {
    "@types/node": "^24",
    "@vitejs/plugin-vue": "^6",
    "@vue/test-utils": "^2",
    "jsdom": "^26",
    "tsx": "^4",
    "typescript": "^6",
    "vite": "^7",
    "vitest": "^3",
    "vue-tsc": "^3"
  }
}
```

Create `tsconfig.json` with `strict: true`, `moduleResolution: "Bundler"`, `noEmit: true`, DOM types, and include `web/**/*.ts`, `web/**/*.vue`, and `test/web/**/*.ts`.

Create `tsconfig.server.json` with `strict: true`, `module` and `moduleResolution` set to `NodeNext`, `rootDir: "src"`, `outDir: "dist"`, and include `src/**/*.ts`. This keeps browser type-checking separate from emitted server JavaScript and emits `src/server/index.ts` as `dist/server/index.js`.

Create `vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3210' } },
});
```

- [x] **Step 6: Implement typed configuration**

Create `src/server/config.ts` exporting:

```ts
export type AppConfig = Readonly<{
  host: string;
  port: number;
  databasePath: string;
  publicDir: string;
  modelBaseUrl: string;
  modelApiKey: string;
  modelId: string;
  modelEnabled: boolean;
  requestTimeoutMs: number;
  disclaimer: string;
}>;

export function loadConfig(env: NodeJS.ProcessEnv, appRoot: string): AppConfig;
```

Use these environment names:

```dotenv
HOST=0.0.0.0
PORT=3210
DATABASE_PATH=runtime/live-in-hdu.db
TOKENDANCE_BASE_URL=https://tokendance.space/gateway/v1
TOKENDANCE_API_KEY=
TOKENDANCE_MODEL=deepseek-v4-flash
REQUEST_TIMEOUT_MS=20000
```

- [x] **Step 7: Install dependencies and run the baseline test**

Run:

```powershell
npm --prefix apps/freshman-mvp install
npm --prefix apps/freshman-mvp test -- --test-name-pattern="requires Node 24"
```

Expected: PASS.

- [x] **Step 8: Commit the baseline**

```powershell
git add .gitignore package.json apps/freshman-mvp/package.json apps/freshman-mvp/package-lock.json apps/freshman-mvp/tsconfig.json apps/freshman-mvp/tsconfig.server.json apps/freshman-mvp/vite.config.ts apps/freshman-mvp/.env.example apps/freshman-mvp/src/server/config.ts apps/freshman-mvp/test/baseline.test.ts
git commit -m "chore: establish typed local platform baseline"
```

---

### Task 2: Add the SQLite Schema and Repository Contracts

**Files:**
- Create: `apps/freshman-mvp/src/domain/models.ts`
- Create: `apps/freshman-mvp/src/domain/errors.ts`
- Create: `apps/freshman-mvp/src/repositories/contracts.ts`
- Create: `apps/freshman-mvp/src/db/migrations.ts`
- Create: `apps/freshman-mvp/src/db/sqlite.ts`
- Create: `apps/freshman-mvp/src/repositories/sqlite-content-repository.ts`
- Create: `apps/freshman-mvp/src/repositories/sqlite-review-repository.ts`
- Test: `apps/freshman-mvp/test/sqlite-repositories.test.ts`

**Interfaces:**
- Consumes: `AppConfig.databasePath`.
- Produces: `ContentRepository`, `ReviewRepository`, `openDatabase(path)`, `migrateDatabase(db)`.

- [x] **Step 1: Write failing persistence and FIFO tests**

Create tests asserting:

```ts
const content = new SqliteContentRepository(db);
await content.createIntent({
  id: 'campus-card',
  category: '校园生活',
  question: '校园一卡通如何领取？',
  intentDescription: '新生首次领取和激活校园卡',
  aliases: ['学校怎么办校园卡'],
  keywords: ['校园卡', '一卡通'],
  excludeKeywords: ['挂失'],
  active: true,
  featured: true,
  displayOrder: 1,
});
assert.equal((await content.listPublishedQuestions()).length, 0);

await content.publishCanonicalAnswer({
  intentId: 'campus-card',
  summary: '到校后按学院通知领取并激活校园一卡通。',
  fullAnswer: '到校后按学院通知领取并激活校园一卡通，具体地点以当年通知为准。',
  sources: [{ type: 'community', title: '新生指北', url: '', updatedAt: '2026-07-28' }],
  reviewerId: 'local-admin',
});
assert.equal((await content.listPublishedQuestions())[0].trustStatus, 'approved');
```

Also enqueue two review items and assert ordinals `[1, 2]` after closing and reopening the database.

- [x] **Step 2: Run the repository tests and verify they fail**

Run:

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="SQLite"
```

Expected: FAIL because the database modules do not exist.

- [x] **Step 3: Define exact domain types**

In `models.ts`, define:

```ts
export type TrustStatus = 'approved' | 'knowledge' | 'web-unverified';
export type AnswerStatus = 'draft' | 'pending' | 'published' | 'needs_update' | 'disabled';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_more';

export interface SourceRef {
  type: 'official' | 'community' | 'student' | 'web';
  title: string;
  url: string;
  updatedAt: string | null;
}

export interface PublishedQuestion {
  id: string;
  category: string;
  question: string;
  summary: string;
  fullAnswer: string;
  sources: SourceRef[];
  trustStatus: 'approved';
  updatedAt: string;
  featured: boolean;
  displayOrder: number;
}
```

Define `RawAnswer`, `QuestionIntent`, `CanonicalAnswerVersion`, `ReviewTask`, `QuestionContext`, and `AnswerResult` in the same file with no optional state fields that can become ambiguous.

- [x] **Step 4: Implement idempotent migrations**

`migrations.ts` must create:

```sql
schema_migrations
question_intents
intent_aliases
raw_answers
canonical_answers
canonical_answer_sources
review_tasks
conversations
feedback
app_settings
```

Use foreign keys, unique `question_intents.id`, unique `(intent_id, version)`, and an integer `review_tasks.ordinal` assigned inside an immediate transaction.

- [x] **Step 5: Implement repository methods**

`contracts.ts` must export:

```ts
export interface ContentRepository {
  createIntent(input: QuestionIntent): Promise<void>;
  upsertRawAnswers(items: RawAnswer[]): Promise<number>;
  listPublishedQuestions(): Promise<PublishedQuestion[]>;
  getIntentCatalog(): Promise<QuestionIntent[]>;
  publishCanonicalAnswer(input: PublishCanonicalAnswerInput): Promise<CanonicalAnswerVersion>;
  listRawAnswers(intentId: string): Promise<RawAnswer[]>;
}

export interface ReviewRepository {
  enqueue(input: EnqueueReviewInput): Promise<ReviewTask>;
  list(status?: ReviewStatus): Promise<ReviewTask[]>;
  decide(id: string, decision: ReviewDecision): Promise<ReviewTask>;
}
```

Implement both SQLite repositories with prepared statements and JSON serialization only for alias, keyword, and source arrays.

- [x] **Step 6: Run persistence tests**

Run:

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="SQLite"
```

Expected: PASS and temporary test databases are removed by test cleanup.

- [x] **Step 7: Commit the database boundary**

```powershell
git add apps/freshman-mvp/src/domain apps/freshman-mvp/src/db apps/freshman-mvp/src/repositories apps/freshman-mvp/test/sqlite-repositories.test.ts
git commit -m "feat: add versioned SQLite content repositories"
```

---

### Task 3: Import and Clean the Current Feishu Workbook

**Files:**
- Create: `apps/freshman-mvp/src/services/content-importer.ts`
- Create: `apps/freshman-mvp/scripts/import-feishu-xlsx.mts`
- Test: `apps/freshman-mvp/test/content-importer.test.ts`
- Read input: `output/playwright/current-40q-2026-07-27.xlsx`

**Interfaces:**
- Consumes: `ContentRepository.createIntent`, `ContentRepository.upsertRawAnswers`.
- Produces: `parseWorkbookRows(rows)`, `importWorkbook(path, repository)`, `ImportReport`.

- [x] **Step 1: Write failing cleanup tests with representative workbook rows**

Use this fixture:

```ts
const rows = [
  ['问题编号', '问题分类', '新生问题', '回答要点', '学长学姐回答（一）', '回答（二）', '回答（三）'],
  ['Q01', '报到与开学准备', '我会在哪个校区学习？', '询问学习校区', '看你的专业安排。', '不同校区条件不同。', null],
  ['Q02', '报到与开学准备', '新生报到流程是什么？', '询问报到流程', '以录取通知书为准。', null, 19],
];
const report = parseWorkbookRows(rows);
assert.equal(report.intents.length, 2);
assert.equal(report.rawAnswers.length, 3);
assert.equal(report.rejectedCells[0].reason, 'residual-demographic-value');
assert.equal(report.rejectedCells[0].cell, 'G3');
```

Also test that repeated import preserves existing raw-answer IDs using a deterministic SHA-256 fingerprint.

- [x] **Step 2: Run importer tests and verify failure**

Run:

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="workbook"
```

Expected: FAIL because `content-importer.ts` does not exist.

- [x] **Step 3: Implement row normalization**

`parseWorkbookRows` must:

- require headers `问题编号`, `问题分类`, `新生问题`, `回答要点`;
- accept answer columns whose header starts with `学长学姐回答` or `回答`;
- reject empty strings;
- reject numeric-only values of 1–2 digits in answer columns as residual demographic values;
- generate stable intent IDs from existing preset exact-question matches, otherwise `q-<lowercase question number>`;
- preserve the original question number as `externalId`;
- set imported answers to `raw` only; never auto-publish.

- [x] **Step 4: Implement the command-line importer**

Command:

```powershell
npm --prefix apps/freshman-mvp exec -- tsx scripts/import-feishu-xlsx.mts --input "C:\Users\Star\Desktop\总项目文件\杭电飞书社区\output\playwright\current-40q-2026-07-27.xlsx" --database "runtime\live-in-hdu.db" --dry-run
```

The dry-run JSON must include:

```json
{
  "questionCount": 35,
  "acceptedAnswerCount": 34,
  "rejectedAnswerCount": 34,
  "publishedCount": 0
}
```

If actual accepted counts differ because the source workbook changed, the command must print the exact row/cell differences and require a non-dry run to proceed; it must not silently hard-code these counts.

- [x] **Step 5: Run dry-run and import tests**

Run:

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="workbook"
npm --prefix apps/freshman-mvp exec -- tsx scripts/import-feishu-xlsx.mts --input "..\..\output\playwright\current-40q-2026-07-27.xlsx" --database "runtime\live-in-hdu.db" --dry-run
```

Expected: tests PASS; report identifies `19` cells as rejected and publishes nothing.

- [x] **Step 6: Perform the first real import and verify database totals**

Run:

```powershell
npm --prefix apps/freshman-mvp exec -- tsx scripts/import-feishu-xlsx.mts --input "..\..\output\playwright\current-40q-2026-07-27.xlsx" --database "runtime\live-in-hdu.db"
npm --prefix apps/freshman-mvp exec -- tsx scripts/import-feishu-xlsx.mts --input "..\..\output\playwright\current-40q-2026-07-27.xlsx" --database "runtime\live-in-hdu.db"
```

Expected: the second import reports zero new raw answers and zero duplicate rows.

- [x] **Step 7: Commit the importer**

```powershell
git add apps/freshman-mvp/src/services/content-importer.ts apps/freshman-mvp/scripts/import-feishu-xlsx.mts apps/freshman-mvp/test/content-importer.test.ts
git commit -m "feat: import and clean Feishu question workbook"
```

---

### Task 4: Add Canonical Answer Drafting and Publication APIs

**Files:**
- Create: `apps/freshman-mvp/src/services/content-review-service.ts`
- Create: `apps/freshman-mvp/src/server/app.ts`
- Test: `apps/freshman-mvp/test/api-v2.test.ts`

**Interfaces:**
- Consumes: `ContentRepository`, `ReviewRepository`.
- Produces: Fastify routes `/api/questions`, `/api/admin/intents`, `/api/admin/intents/:id/raw-answers`, `/api/admin/intents/:id/publish`, `/api/reviews`.

- [x] **Step 1: Write failing API tests**

Assert:

```ts
const publicBefore = await app.inject({ method: 'GET', url: '/api/questions' });
assert.deepEqual(publicBefore.json(), { items: [] });

const publish = await app.inject({
  method: 'POST',
  url: '/api/admin/intents/campus-card/publish',
  payload: {
    summary: '到校后按学院通知领取并激活校园卡。',
    fullAnswer: '完整回答正文。',
    sources: [{ type: 'community', title: '新生指北', url: '', updatedAt: '2026-07-28' }],
    reviewerId: 'local-admin',
  },
});
assert.equal(publish.statusCode, 200);
assert.equal((await app.inject({ method: 'GET', url: '/api/questions' })).json().items[0].summary.length > 0, true);
```

Also assert 400 for summaries shorter than 20 or longer than 150 Chinese characters, missing full answers, and empty sources.

- [x] **Step 2: Run API tests and verify failure**

Run:

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="publication API"
```

Expected: FAIL because the Fastify app factory does not exist.

- [x] **Step 3: Implement `ContentReviewService` validation**

Export:

```ts
export class ContentReviewService {
  constructor(private readonly content: ContentRepository) {}
  listPublicQuestions(): Promise<PublishedQuestion[]>;
  listIntentWorkspace(): Promise<IntentWorkspaceItem[]>;
  publish(intentId: string, input: PublishCanonicalAnswerInput): Promise<CanonicalAnswerVersion>;
}
```

Count Chinese code points with `Array.from(summary.trim()).length`, enforce 20–150, require full answer and at least one source, and reject publishing an inactive intent.

- [x] **Step 4: Implement the Fastify app factory**

Export:

```ts
export interface AppDependencies {
  config: AppConfig;
  content: ContentRepository;
  reviews: ReviewRepository;
  router: AnswerRouter;
}

export function createApp(deps: AppDependencies): FastifyInstance;
```

Return `{ items }` envelopes consistently and use `{ error: { code, message } }` for errors.

- [x] **Step 5: Run publication API tests**

Run:

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="publication API"
```

Expected: PASS.

- [x] **Step 6: Commit the review workflow**

```powershell
git add apps/freshman-mvp/src/services/content-review-service.ts apps/freshman-mvp/src/server/app.ts apps/freshman-mvp/test/api-v2.test.ts
git commit -m "feat: add canonical answer review APIs"
```

---

### Task 5: Implement TokenDance and Three-Stage Answer Routing

**Files:**
- Create: `apps/freshman-mvp/src/providers/contracts.ts`
- Create: `apps/freshman-mvp/src/providers/tokendance-provider.ts`
- Create: `apps/freshman-mvp/src/providers/local-knowledge-provider.ts`
- Create: `apps/freshman-mvp/src/providers/unavailable-search-provider.ts`
- Create: `apps/freshman-mvp/src/services/intent-matcher.ts`
- Create: `apps/freshman-mvp/src/services/answer-router.ts`
- Test: `apps/freshman-mvp/test/tokendance-provider.test.ts`
- Test: `apps/freshman-mvp/test/answer-router-v2.test.ts`

**Interfaces:**
- Consumes: repositories, `AppConfig`, TokenDance chat-completions endpoint.
- Produces: `ModelProvider.classifyIntent`, `ModelProvider.synthesize`, `KnowledgeProvider.search`, `SearchProvider.search`, `AnswerRouter.answer`.

- [x] **Step 1: Write failing TokenDance request tests**

Use a fake `fetch` and assert:

```ts
assert.equal(request.url, 'https://tokendance.space/gateway/v1/chat/completions');
assert.equal(request.headers.Authorization, 'Bearer test-key');
assert.equal(JSON.parse(request.body).model, 'deepseek-v4-flash');
assert.doesNotMatch(JSON.stringify(result), /test-key/);
```

Test 20-second abort handling and invalid JSON classification returning `null` instead of throwing.

- [x] **Step 2: Write failing router precedence and persistence tests**

Cover:

1. semantic variant matches a published preset;
2. non-preset local knowledge returns `trustStatus: "knowledge"`;
3. unknown question invokes model synthesis;
4. fallback persists a pending review before returning;
5. persistence failure returns HTTP 503 rather than an untracked answer;
6. every fallback contains the exact disclaimer;
7. two fallbacks remain FIFO after repository restart.

- [x] **Step 3: Implement provider contracts**

```ts
export interface IntentClassification {
  intentId: string | null;
  confidence: number;
  reason: string;
}

export interface SearchItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResult {
  available: boolean;
  items: SearchItem[];
}

export interface KnowledgeHit {
  answer: string;
  sources: SourceRef[];
}

export interface SynthesisInput {
  question: string;
  search: SearchResult;
}

export interface ModelAnswer {
  text: string;
  sources: SourceRef[];
}

export interface ModelProvider {
  classifyIntent(question: string, intents: QuestionIntent[]): Promise<IntentClassification | null>;
  synthesize(input: SynthesisInput): Promise<ModelAnswer>;
}

export interface KnowledgeProvider {
  search(question: string): Promise<KnowledgeHit | null>;
}

export interface SearchProvider {
  search(question: string): Promise<SearchResult>;
}
```

`UnavailableSearchProvider` must return `{ available: false, items: [] }`, never fake search results.

- [x] **Step 4: Implement intent matching and model classification**

Reuse the proven normalization, aliases, keywords, and exclusion behavior from `src/matching.mjs`. Local high-confidence matches run first; otherwise TokenDance receives only the active intent catalog and must return JSON:

```json
{"intentId":"allowed-id-or-null","confidence":0.0,"reason":"short explanation"}
```

Accept model classification only when the returned ID exists and confidence is at least the configured threshold.

- [x] **Step 5: Implement the router**

Return:

```ts
export type AnswerResult =
  | { route: 'preset'; trustStatus: 'approved'; answer: string; sources: SourceRef[]; intentId: string }
  | { route: 'knowledge'; trustStatus: 'knowledge'; answer: string; sources: SourceRef[] }
  | { route: 'web'; trustStatus: 'web-unverified'; answer: string; sources: SourceRef[]; disclaimer: string; reviewOrdinal: number };
```

The web route sequence is strictly:

```ts
const search = await searchProvider.search(question);
const model = await modelProvider.synthesize({ question, search });
const review = await reviews.enqueue({ question, answer: model.text, sources: model.sources });
return { route: 'web', answer: model.text, reviewOrdinal: review.ordinal, disclaimer: config.disclaimer, ... };
```

- [x] **Step 6: Run provider and router tests**

Run:

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="TokenDance|router v2"
```

Expected: PASS.

- [x] **Step 7: Commit routing**

```powershell
git add apps/freshman-mvp/src/providers apps/freshman-mvp/src/services/intent-matcher.ts apps/freshman-mvp/src/services/answer-router.ts apps/freshman-mvp/test/tokendance-provider.test.ts apps/freshman-mvp/test/answer-router-v2.test.ts
git commit -m "feat: route questions through presets knowledge and TokenDance"
```

---

### Task 6: Build the Confirmed Mobile Question-Deck Experience

**Files:**
- Create: `apps/freshman-mvp/web/index.html`
- Create: `apps/freshman-mvp/web/env.d.ts`
- Create: `apps/freshman-mvp/web/main.ts`
- Create: `apps/freshman-mvp/web/App.vue`
- Create: `apps/freshman-mvp/web/router.ts`
- Create: `apps/freshman-mvp/web/api.ts`
- Create: `apps/freshman-mvp/web/styles/tokens.css`
- Create: `apps/freshman-mvp/web/components/QuestionCard.vue`
- Create: `apps/freshman-mvp/web/components/QuestionCatalog.vue`
- Create: `apps/freshman-mvp/web/components/AskSheet.vue`
- Create: `apps/freshman-mvp/web/components/SourceBadge.vue`
- Create: `apps/freshman-mvp/web/views/QuestionDeckView.vue`
- Create: `apps/freshman-mvp/web/views/ChatView.vue`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`

**Interfaces:**
- Consumes: `GET /api/questions`, `POST /api/ask`.
- Produces: `/` question deck, `/chat` full-screen conversation route.

- [x] **Step 1: Write failing component tests**

Mount `QuestionDeckView` with 12 questions and assert:

```ts
expect(wrapper.text()).toContain('新生必看 12 问');
expect(wrapper.text()).toContain('01 / 12');
expect(wrapper.text()).toContain('展开完整回答');
expect(wrapper.text()).toContain('已审核标准答案');
await wrapper.get('[data-action="next"]').trigger('click');
expect(wrapper.text()).toContain('02 / 12');
await wrapper.get('[data-action="ask"]').trigger('click');
expect(wrapper.get('[data-role="ask-sheet"]').exists()).toBe(true);
```

Also assert that the catalog jumps to a selected question and `localStorage` restores the last index.

- [x] **Step 2: Run web tests and verify failure**

Run:

```powershell
npm --prefix apps/freshman-mvp run test:web -- --testNamePattern="question deck"
```

Expected: FAIL because the Vue components do not exist.

- [x] **Step 3: Implement API and route shells**

`api.ts` exports:

```ts
export async function listQuestions(): Promise<PublishedQuestion[]>;
export async function askQuestion(question: string, context?: QuestionContext): Promise<AnswerResult>;
```

Create `env.d.ts` containing `/// <reference types="vite/client" />`. Create routes `/` and `/chat`; reject non-JSON API responses with a user-readable retry state.

- [x] **Step 4: Implement confirmed card behavior**

`QuestionDeckView.vue` must:

- render featured questions first;
- show progress and category;
- show summary by default;
- expand and collapse `fullAnswer`;
- support previous/next buttons and touch swipe;
- open the complete categorized catalog;
- persist the current question ID, not an array index;
- show `没有解决我的问题，直接提问` as a fixed action.

- [x] **Step 5: Implement the ask-sheet to chat handoff**

`AskSheet.vue` emits:

```ts
defineEmits<{
  submit: [payload: { question: string; context: QuestionContext }];
  close: [];
}>();
```

On submit, store the pending payload in router state and navigate to `/chat`. `ChatView.vue` displays the context card, streams or waits for the answer, and offers a return button that preserves the deck position.

- [x] **Step 6: Run web tests and build**

Run:

```powershell
npm --prefix apps/freshman-mvp run test:web
npm --prefix apps/freshman-mvp run build
```

Expected: PASS; `dist/client/index.html` exists and no credential string occurs in `dist/client`.

- [x] **Step 7: Commit the mobile client**

```powershell
git add apps/freshman-mvp/web apps/freshman-mvp/test/web/question-deck.test.ts
git commit -m "feat: add mobile paged freshman question deck"
```

---

### Task 7: Build the Local Operations Console

**Files:**
- Create: `apps/freshman-mvp/web/views/AdminView.vue`
- Create: `apps/freshman-mvp/web/components/AdminIntentList.vue`
- Create: `apps/freshman-mvp/web/components/AdminAnswerEditor.vue`
- Create: `apps/freshman-mvp/web/components/AdminReviewQueue.vue`
- Test: `apps/freshman-mvp/test/web/admin.test.ts`

**Interfaces:**
- Consumes: admin intent, raw-answer, publish, review-list, and review-decision APIs.
- Produces: `/admin` operations console.

- [x] **Step 1: Write failing operations-console tests**

Assert:

- unpublished intents display `待整理`;
- raw answers are visible but not labeled published;
- summary character count turns invalid below 20 or above 150;
- publishing requires at least one source;
- pending reviews remain in oldest-first order;
- approve, reject, and `需补充` actions send exact API payloads.

- [x] **Step 2: Run admin tests and verify failure**

Run:

```powershell
npm --prefix apps/freshman-mvp run test:web -- --testNamePattern="operations console"
```

Expected: FAIL because the admin components do not exist.

- [x] **Step 3: Implement content workspace**

The left pane lists intents and states. The main pane shows:

1. question and intent description;
2. all accepted raw answers with source cell;
3. rejected-cell warnings;
4. summary editor with live count;
5. full-answer editor;
6. source editor;
7. publish action.

No action may mutate a published answer without creating a new version.

- [x] **Step 4: Implement the FIFO review queue**

Render `displayLabel`, question, temporary answer, sources, risk level, created time, and status. Sort using server order only; the client must not reprioritize high-risk entries above older items.

- [x] **Step 5: Run admin tests and build**

Run:

```powershell
npm --prefix apps/freshman-mvp run test:web
npm --prefix apps/freshman-mvp run build
```

Expected: PASS.

- [x] **Step 6: Commit the console**

```powershell
git add apps/freshman-mvp/web/views/AdminView.vue apps/freshman-mvp/web/components/AdminIntentList.vue apps/freshman-mvp/web/components/AdminAnswerEditor.vue apps/freshman-mvp/web/components/AdminReviewQueue.vue apps/freshman-mvp/test/web/admin.test.ts
git commit -m "feat: add local content and review console"
```

---

### Task 8: Add Start, Stop, Backup, and End-to-End Verification

**Files:**
- Create: `apps/freshman-mvp/src/server/index.ts`
- Modify: `apps/freshman-mvp/server.mjs`
- Create: `apps/freshman-mvp/scripts/backup-sqlite.mts`
- Create: `scripts/start-freshman-platform.ps1`
- Create: `scripts/stop-freshman-platform.ps1`
- Create: `scripts/test-freshman-platform.ps1`
- Modify: `apps/freshman-mvp/README.md`
- Modify: `README.md`
- Modify: `TASKS.md`
- Modify: `CHANGELOG.md`
- Test: `apps/freshman-mvp/test/e2e-v2.test.ts`

**Interfaces:**
- Consumes: completed app, database, built client.
- Produces: one-command local operation and a verified LAN URL.

- [x] **Step 1: Write a failing full-flow end-to-end test**

Start the app on an ephemeral port and assert:

1. `/api/health` reports database, model configuration, knowledge mode, and queue health separately;
2. `/api/questions` returns only published questions;
3. a semantic preset variant returns `preset`;
4. a local knowledge question returns `knowledge`;
5. an unknown question returns an answer and exact disclaimer;
6. the pending review remains after app restart;
7. the built `/` and `/admin` routes return HTML.

- [x] **Step 2: Run the end-to-end test and verify failure**

Run:

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="full local flow"
```

Expected: FAIL because the production entrypoint is incomplete.

- [x] **Step 3: Implement the production entrypoint**

`index.ts` must:

- resolve the app root from `import.meta.url`;
- open and migrate SQLite before listening;
- compose repositories, providers, router, and Fastify;
- log localhost, admin, and LAN URLs;
- close Fastify and SQLite on SIGINT/SIGTERM;
- exit nonzero if migrations or binding fail.

Keep `server.mjs` as:

```js
import './dist/server/index.js';
```

until all old start references are updated.

- [x] **Step 4: Implement PowerShell lifecycle scripts**

`start-freshman-platform.ps1` must:

- load `.env.local`;
- build only when `dist` is missing or source is newer;
- start Node hidden;
- write PID and logs under `output/freshman-platform/`;
- poll `/api/health`;
- print LAN URL;
- optionally open the browser.

`stop-freshman-platform.ps1` must stop only the PID recorded for this app and verify termination.

`test-freshman-platform.ps1` must run backend tests, web tests, build, secret scan, and the HTTP smoke test.

- [x] **Step 5: Implement SQLite backup**

Run:

```powershell
npm --prefix apps/freshman-mvp exec -- tsx scripts/backup-sqlite.mts --database runtime/live-in-hdu.db --output "..\..\output\freshman-platform\backups"
```

The script must use SQLite backup/VACUUM INTO semantics, include UTC timestamp in the filename, retain the latest 14 backups, and verify the copied database opens.

- [x] **Step 6: Run all automated checks**

Run:

```powershell
.\scripts\test-freshman-platform.ps1
```

Expected: all Node tests, Vitest tests, build, secret scan, and HTTP smoke checks pass.

- [ ] **Step 7: Perform a real browser and phone-width smoke test**

Status 2026-07-28: Edge at 390×844, console-error check, localhost routes, LAN HTTP
reachability, restart persistence, and administrator FIFO behavior passed. A physical
phone interaction check remains a human acceptance item; it is not represented as
completed by viewport emulation alone.

Run:

```powershell
.\scripts\start-freshman-platform.ps1
```

Verify in Edge at 390×844 and on a phone on the same Wi-Fi:

- question deck loads;
- next/previous/swipe work;
- catalog jump works;
- answer expand/collapse works;
- ask sheet opens;
- chat keeps card context;
- admin publishing creates a new version;
- pending reviews remain FIFO after restart.

- [x] **Step 8: Update documentation and execution records**

Document:

- exact start/stop/test commands;
- local-only availability and the requirement that the computer stays on;
- how to create `.env.local`;
- TokenDance key security;
- backup and restore commands;
- Phase B limitations: no WeKnora, PostgreSQL, or verified independent web search yet.

- [x] **Step 9: Commit the verified Phase A system**

```powershell
git add apps/freshman-mvp scripts/start-freshman-platform.ps1 scripts/stop-freshman-platform.ps1 scripts/test-freshman-platform.ps1 README.md TASKS.md CHANGELOG.md
git commit -m "feat: deliver local freshman agent foundation"
```

---

## Phase A Completion Gate

Do not start Phase B until all are true:

- The latest Feishu workbook imports idempotently and rejects residual `19` values.
- At least one canonical answer is published manually through the admin console.
- The mobile deck displays published questions in configured order.
- TokenDance calls use server-only credentials and pass the fake-fetch contract tests.
- Unknown questions always return the exact disclaimer and persist FIFO reviews.
- Restart persistence, backup restore, Edge mobile viewport, and same-Wi-Fi phone access pass.
- The test script passes twice consecutively from a clean process state.
