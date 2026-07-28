# LIVE IN HDU WeKnora Local Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the verified Phase A application to a complete local knowledge platform with an isolated PostgreSQL business database, WeKnora document retrieval, local SearXNG search, cited TokenDance answers, durable backups, and tested degradation behavior.

**Architecture:** Keep the LIVE IN HDU Fastify gateway as the only product API. Move its repositories from SQLite to a dedicated PostgreSQL 17 container. Run the pinned WeKnora 0.7.0 stack separately and consume only its documented REST API; never query or modify WeKnora tables. Use the bundled SearXNG profile through an independent `SearchProvider`. Use the Windows Ollama service only for the small `nomic-embed-text` embedding model required by local retrieval; all answer generation remains on TokenDance `deepseek-v4-flash`.

**Tech Stack:** Docker Desktop with WSL2, Docker Compose, PostgreSQL 17, Node.js 24, TypeScript, Fastify, `pg`, WeKnora 0.7.0 at commit `150c07368b84b4f50421b8957255213cbbadc175`, Ollama with `nomic-embed-text:latest`, SearXNG, TokenDance OpenAI-compatible API, Node test runner, Vitest, Playwright Core.

## Global Constraints

- Begin only after every Phase A completion gate passes.
- The application database and WeKnora database are separate containers and separate volumes.
- LIVE IN HDU must not depend on WeKnora's private tables, Redis keys, frontend, or Go internals.
- Only WeKnora REST endpoints under `/api/v1` are integration contracts.
- WeKnora app, PostgreSQL, Redis, DocReader, Ollama, and SearXNG listen on loopback or internal Docker networks; phones access only the LIVE IN HDU gateway.
- `TOKENDANCE_API_KEY`, `WEKNORA_API_KEY`, database passwords, JWT secrets, and SearXNG secrets never enter Git, frontend assets, logs, or API responses.
- The fixed third-stage disclaimer remains exactly `该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别`.
- Search results are leads, not verified facts. Third-stage results are always marked `web-unverified` and queued before response.
- Search failure must never produce invented titles, URLs, or claims.
- Question count and knowledge document count remain data-driven.
- The first knowledge corpus includes only source files that an administrator explicitly places in the approved import manifest; unrelated files under `最新资料` are not imported automatically.

---

## File Structure

Add or evolve:

```text
apps/freshman-mvp/
├── package.json
├── .env.example
├── src/
│   ├── db/
│   │   ├── postgres.ts
│   │   └── postgres-migrations.ts
│   ├── repositories/
│   │   ├── postgres-content-repository.ts
│   │   └── postgres-review-repository.ts
│   ├── providers/
│   │   ├── weknora-provider.ts
│   │   └── searxng-provider.ts
│   ├── services/
│   │   ├── sqlite-postgres-migrator.ts
│   │   ├── knowledge-import-service.ts
│   │   └── faq-sync-service.ts
│   └── server/
│       ├── config.ts
│       └── index.ts
├── scripts/
│   ├── migrate-sqlite-to-postgres.mts
│   ├── import-approved-knowledge.mts
│   └── check-weknora.mts
└── test/
    ├── postgres-repositories.test.ts
    ├── sqlite-postgres-migrator.test.ts
    ├── weknora-provider.test.ts
    ├── searxng-provider.test.ts
    ├── knowledge-import.test.ts
    ├── faq-sync.test.ts
    └── phase-b-e2e.test.ts
deploy/local/
├── compose.platform.yml
├── compose.weknora.override.yml
├── .env.example
├── knowledge-manifest.example.json
└── README.md
scripts/
├── preflight-phase-b.ps1
├── start-knowledge-stack.ps1
├── stop-knowledge-stack.ps1
├── test-knowledge-stack.ps1
└── backup-knowledge-stack.ps1
output/freshman-platform/
├── approved-knowledge/              # runtime corpus; ignored
├── knowledge-manifest.json          # runtime manifest; ignored
└── backups/                         # runtime backups; ignored
```

---

### Task 1: Establish and Verify the Container and Embedding Prerequisites

**Files:**
- Create: `scripts/preflight-phase-b.ps1`
- Create: `deploy/local/.env.example`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: Windows 11, WSL2, Docker Desktop, Node.js 24, Ollama.
- Produces: a machine-readable preflight JSON report and a human-readable remediation summary.

- [x] **Step 1: Write the preflight script before installing anything**

`preflight-phase-b.ps1` must check and report:

```json
{
  "wslVersion2": true,
  "dockerCli": true,
  "dockerEngine": true,
  "composeV2": true,
  "virtualization": true,
  "freeDiskGb": 50,
  "memoryGb": 16,
  "ollamaCli": true,
  "embeddingModel": "nomic-embed-text:latest",
  "portsAvailable": [3210, 5433, 8080, 8888, 11434]
}
```

The script exits `0` only when all required checks pass. It must distinguish “Docker CLI missing” from “Docker Desktop installed but engine stopped”.

- [x] **Step 2: Run preflight and preserve the initial failure report**

Run:

```powershell
.\scripts\preflight-phase-b.ps1 -JsonOutput .\output\freshman-platform\phase-b-preflight.json
```

Expected on the currently inspected machine: WSL2 and Node pass; Docker checks fail until Docker Desktop is installed and running.

- [ ] **Step 3: Install Docker Desktop using the official Windows installer**

Install Docker Desktop with WSL2 backend, enable integration for the installed Ubuntu distribution, restart Windows if requested, then verify:

```powershell
docker version
docker compose version
docker run --rm hello-world
```

Expected: both client and server versions print, Compose reports v2, and `hello-world` exits successfully.

- [ ] **Step 4: Install Ollama and pull only the embedding model**

Install the official Windows Ollama package and run:

```powershell
ollama pull nomic-embed-text:latest
ollama list
Invoke-RestMethod -Uri http://127.0.0.1:11434/api/embed -Method Post -ContentType 'application/json' -Body '{"model":"nomic-embed-text:latest","input":"杭州电子科技大学新生"}'
```

Expected: the model appears in `ollama list` and the embedding response contains a non-empty numeric vector. Do not pull a local chat model.

- [x] **Step 5: Define local secret names without values**

`deploy/local/.env.example` must document:

```dotenv
LIVE_IN_HDU_DB_NAME=live_in_hdu
LIVE_IN_HDU_DB_USER=live_in_hdu
LIVE_IN_HDU_DB_PASSWORD=
LIVE_IN_HDU_DB_PORT=5433
WEKNORA_VERSION=0.7.0
WEKNORA_APP_PORT=8080
WEKNORA_API_KEY=
WEKNORA_DOCUMENT_KB_ID=
WEKNORA_FAQ_KB_ID=
SEARXNG_BIND=127.0.0.1
SEARXNG_PORT=8888
SEARXNG_SECRET=
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Generate local password and SearXNG secret with cryptographic randomness in the setup script; never place example secrets in the real `.env.local`.

- [x] **Step 6: Protect all Phase B runtime material**

Add:

```gitignore
deploy/local/.env.local
vendor/WeKnora/.env
output/freshman-platform/approved-knowledge/
output/freshman-platform/knowledge-manifest.json
output/freshman-platform/backups/
```

- [ ] **Step 7: Rerun preflight**

Run:

```powershell
.\scripts\preflight-phase-b.ps1 -JsonOutput .\output\freshman-platform\phase-b-preflight.json
```

Expected: exit `0`, all required booleans are true, and all listed ports are available.

- [x] **Step 8: Commit the prerequisite boundary**

```powershell
git add .gitignore scripts/preflight-phase-b.ps1 deploy/local/.env.example README.md
git commit -m "chore: define local knowledge stack prerequisites"
```

---

### Task 2: Add an Isolated PostgreSQL Business Database

**Files:**
- Create: `deploy/local/compose.platform.yml`
- Modify: `apps/freshman-mvp/package.json`
- Create: `apps/freshman-mvp/src/db/postgres.ts`
- Create: `apps/freshman-mvp/src/db/postgres-migrations.ts`
- Create: `apps/freshman-mvp/src/repositories/postgres-content-repository.ts`
- Create: `apps/freshman-mvp/src/repositories/postgres-review-repository.ts`
- Test: `apps/freshman-mvp/test/postgres-repositories.test.ts`

**Interfaces:**
- Consumes: existing `ContentRepository` and `ReviewRepository` contracts.
- Produces: PostgreSQL implementations with behavior identical to Phase A SQLite repositories.

- [x] **Step 1: Write PostgreSQL contract tests**

Run the same repository behavior suite against both SQLite and PostgreSQL. Required assertions:

- publishing creates a new canonical version and does not mutate the previous version;
- `listPublishedQuestions` returns only current published versions;
- enqueue assigns unique increasing ordinals under 20 concurrent requests;
- pending review order is `created_at ASC, ordinal ASC`;
- restart preserves intents, canonical versions, conversations, feedback, and review tasks;
- transaction rollback leaves no partial answer or source rows.

- [x] **Step 2: Run tests and verify the PostgreSQL implementation is missing**

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="PostgreSQL repository contract"
```

Expected: FAIL because the PostgreSQL modules do not exist.

- [x] **Step 3: Create the isolated database service**

`deploy/local/compose.platform.yml` must define only:

```yaml
services:
  live-in-hdu-db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${LIVE_IN_HDU_DB_NAME}
      POSTGRES_USER: ${LIVE_IN_HDU_DB_USER}
      POSTGRES_PASSWORD: ${LIVE_IN_HDU_DB_PASSWORD}
    ports:
      - "127.0.0.1:${LIVE_IN_HDU_DB_PORT:-5433}:5432"
    volumes:
      - live-in-hdu-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${LIVE_IN_HDU_DB_USER} -d ${LIVE_IN_HDU_DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 12
    restart: unless-stopped

volumes:
  live-in-hdu-postgres:
```

Do not attach this service to WeKnora's network and do not reuse WeKnora credentials.

- [ ] **Step 4: Start the business database**

```powershell
docker compose --env-file deploy/local/.env.local -f deploy/local/compose.platform.yml up -d
docker compose --env-file deploy/local/.env.local -f deploy/local/compose.platform.yml ps
```

Expected: `live-in-hdu-db` becomes healthy and only `127.0.0.1:5433` is published.

- [x] **Step 5: Implement the PostgreSQL connection and migrations**

Install `pg` and `@types/pg`. Export:

```ts
export function createPostgresPool(connectionString: string): Pool;
export async function migratePostgres(pool: Pool): Promise<void>;
```

Use equivalent tables and constraints to Phase A. Use:

```sql
CREATE SEQUENCE review_ordinal_seq;
```

and assign `nextval('review_ordinal_seq')` within the insert transaction. Store aliases, keywords, and sources as `jsonb`. Use UTC `timestamptz`.

- [x] **Step 6: Implement both PostgreSQL repositories**

The implementations must satisfy the existing repository contracts without changing the answer router or API handlers. Parameterize all queries. No application query may use WeKnora's database.

- [ ] **Step 7: Run contract and concurrency tests**

```powershell
$escapedPassword = [uri]::EscapeDataString($env:LIVE_IN_HDU_DB_PASSWORD)
$env:TEST_DATABASE_URL = "postgresql://$($env:LIVE_IN_HDU_DB_USER):$escapedPassword@127.0.0.1:$($env:LIVE_IN_HDU_DB_PORT)/$($env:LIVE_IN_HDU_DB_NAME)"
npm --prefix apps/freshman-mvp test -- --test-name-pattern="PostgreSQL repository contract"
```

Expected: PASS, including 20 unique ordered review ordinals.

- [x] **Step 8: Commit the database implementation**

```powershell
git add deploy/local/compose.platform.yml apps/freshman-mvp/package.json apps/freshman-mvp/package-lock.json apps/freshman-mvp/src/db/postgres.ts apps/freshman-mvp/src/db/postgres-migrations.ts apps/freshman-mvp/src/repositories/postgres-content-repository.ts apps/freshman-mvp/src/repositories/postgres-review-repository.ts apps/freshman-mvp/test/postgres-repositories.test.ts
git commit -m "feat: add isolated PostgreSQL business persistence"
```

---

### Task 3: Migrate SQLite Data to PostgreSQL With a Reconciliation Gate

**Files:**
- Create: `apps/freshman-mvp/src/services/sqlite-postgres-migrator.ts`
- Create: `apps/freshman-mvp/scripts/migrate-sqlite-to-postgres.mts`
- Test: `apps/freshman-mvp/test/sqlite-postgres-migrator.test.ts`
- Modify: `apps/freshman-mvp/src/server/config.ts`
- Modify: `apps/freshman-mvp/src/server/index.ts`

**Interfaces:**
- Consumes: Phase A SQLite database and empty migrated PostgreSQL database.
- Produces: idempotent migration report and `DATABASE_DRIVER=postgres` runtime selection.

- [x] **Step 1: Write migration tests**

Create a SQLite fixture with:

- two intents;
- three raw answers;
- two canonical answer versions where only version 2 is published;
- two FIFO review tasks;
- one conversation and one feedback item.

Assert dry-run counts, actual copy counts, stable IDs, JSON equivalence, timestamps, current-version references, and a second-run no-op.

- [x] **Step 2: Run tests and verify failure**

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="SQLite to PostgreSQL"
```

Expected: FAIL because the migrator does not exist.

- [x] **Step 3: Implement ordered migration**

Copy inside one PostgreSQL transaction in this order:

1. `question_intents`;
2. `intent_aliases`;
3. `raw_answers`;
4. `canonical_answers`;
5. `canonical_answer_sources`;
6. `review_tasks`;
7. `conversations`;
8. `feedback`;
9. `app_settings`.

Preserve IDs and timestamps. Advance `review_ordinal_seq` to at least the imported maximum ordinal. Abort the transaction on any count or foreign-key mismatch.

- [x] **Step 4: Implement dry-run and reconciliation output**

Command:

```powershell
npm --prefix apps/freshman-mvp exec -- tsx scripts/migrate-sqlite-to-postgres.mts --sqlite runtime/live-in-hdu.db --postgres $env:DATABASE_URL --dry-run
```

The report must show source count, target count, insert count, skip count, and SHA-256 logical checksum for every table. It must not expose credentials.

- [ ] **Step 5: Perform backup, dry-run, real migration, and second-run verification**

```powershell
npm --prefix apps/freshman-mvp exec -- tsx scripts/backup-sqlite.mts --database runtime/live-in-hdu.db --output "..\..\output\freshman-platform\backups"
npm --prefix apps/freshman-mvp exec -- tsx scripts/migrate-sqlite-to-postgres.mts --sqlite runtime/live-in-hdu.db --postgres $env:DATABASE_URL --dry-run
npm --prefix apps/freshman-mvp exec -- tsx scripts/migrate-sqlite-to-postgres.mts --sqlite runtime/live-in-hdu.db --postgres $env:DATABASE_URL
npm --prefix apps/freshman-mvp exec -- tsx scripts/migrate-sqlite-to-postgres.mts --sqlite runtime/live-in-hdu.db --postgres $env:DATABASE_URL
```

Expected: the real migration reconciles all tables; the second run inserts zero rows.

- [x] **Step 6: Select the repository through configuration**

Add:

```dotenv
DATABASE_DRIVER=sqlite
DATABASE_URL=
```

`index.ts` selects SQLite or PostgreSQL only at composition time. Production Phase B uses `DATABASE_DRIVER=postgres`; tests continue covering both implementations.

- [ ] **Step 7: Run the app against PostgreSQL and verify restart persistence**

```powershell
$env:DATABASE_DRIVER='postgres'
$escapedPassword = [uri]::EscapeDataString($env:LIVE_IN_HDU_DB_PASSWORD)
$env:DATABASE_URL = "postgresql://$($env:LIVE_IN_HDU_DB_USER):$escapedPassword@127.0.0.1:$($env:LIVE_IN_HDU_DB_PORT)/$($env:LIVE_IN_HDU_DB_NAME)"
npm --prefix apps/freshman-mvp run build
npm --prefix apps/freshman-mvp start
```

Verify `/api/questions` and `/api/reviews` match the pre-migration SQLite snapshot, then restart the service and compare again.

- [x] **Step 8: Commit the migration boundary**

```powershell
git add apps/freshman-mvp/src/services/sqlite-postgres-migrator.ts apps/freshman-mvp/scripts/migrate-sqlite-to-postgres.mts apps/freshman-mvp/test/sqlite-postgres-migrator.test.ts apps/freshman-mvp/src/server/config.ts apps/freshman-mvp/src/server/index.ts apps/freshman-mvp/.env.example
git commit -m "feat: migrate local business data to PostgreSQL"
```

---

### Task 4: Start and Secure the Pinned WeKnora Stack

**Files:**
- Create: `scripts/start-knowledge-stack.ps1`
- Create: `scripts/stop-knowledge-stack.ps1`
- Create: `deploy/local/compose.weknora.override.yml`
- Create: `deploy/local/README.md`
- Read: `vendor/WeKnora/VERSION`
- Read: `docs/WEKNORA_UPSTREAM_BASELINE.md`
- Read: `vendor/WeKnora/docker-compose.yml`
- Read: `vendor/WeKnora/docs/api/*.md`

**Interfaces:**
- Consumes: pinned vendor source, Docker Desktop, Ollama embedding endpoint.
- Produces: healthy loopback-only WeKnora API, generated local API key, document KB ID, and FAQ KB ID.

- [x] **Step 1: Enforce the vendor baseline before startup**

`start-knowledge-stack.ps1` must fail unless:

```text
vendor/WeKnora/VERSION = 0.7.0
documented commit = 150c07368b84b4f50421b8957255213cbbadc175
vendor/WeKnora/LICENSE exists
```

It must run `docker compose config` before `up` and reject `latest` for `WEKNORA_VERSION`.

- [ ] **Step 2: Generate a minimal real WeKnora environment file**

Create `vendor/WeKnora/.env` from an explicit allowlist instead of copying the sample file. The setup script writes fresh 32-byte random values for the database password, Redis password, JWT secret, and SearXNG secret, and writes these non-secret settings:

```dotenv
WEKNORA_VERSION=0.7.0
APP_PORT=8080
FRONTEND_PORT=8081
DB_USER=weknora
DB_NAME=weknora
OLLAMA_BASE_URL=http://host.docker.internal:11434
DISABLE_REGISTRATION=false
SEARXNG_BIND=127.0.0.1
SEARXNG_PORT=8888
LANGFUSE_ENABLED=false
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
```

The script must not carry the sample Langfuse credentials from `.env.example` into the real file.

Create `deploy/local/compose.weknora.override.yml`:

```yaml
services:
  app:
    ports: !override
      - "127.0.0.1:${APP_PORT:-8080}:8080"
  frontend:
    ports: !override
      - "127.0.0.1:${FRONTEND_PORT:-8081}:80"
```

The `!override` tag requires Docker Compose 2.24.4 or newer and prevents the base host-wide port bindings from being retained.

- [ ] **Step 3: Start the minimum stack and SearXNG profile**

```powershell
docker compose --project-directory vendor/WeKnora --env-file vendor/WeKnora/.env -f vendor/WeKnora/docker-compose.yml -f deploy/local/compose.weknora.override.yml --profile searxng up -d postgres redis docreader app frontend searxng-init searxng
docker compose --project-directory vendor/WeKnora --env-file vendor/WeKnora/.env -f vendor/WeKnora/docker-compose.yml -f deploy/local/compose.weknora.override.yml --profile searxng ps
```

Expected: PostgreSQL, Redis, DocReader, app, frontend, and SearXNG are healthy or running. Qdrant, Milvus, Weaviate, Doris, Neo4j, MinIO, Langfuse, and sandbox are not started.

- [ ] **Step 4: Perform the one-time administrator bootstrap**

Open `http://127.0.0.1:8081`, create the first local administrator, set `DISABLE_REGISTRATION=true`, restart `app`, and verify a new registration is refused. Then create a scoped API key with:

- knowledge base read;
- knowledge read/write;
- knowledge search;
- FAQ read/write;
- model read/create;
- no system-admin or unrelated tenant-management scope.

Store the key only in `apps/freshman-mvp/.env.local` as `WEKNORA_API_KEY`.

- [ ] **Step 5: Register and test the embedding model**

Create `nomic-embed-text:latest` as an Ollama `Embedding` model with dimension `768`, base URL `http://host.docker.internal:11434`, then use WeKnora's embedding test endpoint. Do not configure Ollama as the answer model.

- [ ] **Step 6: Create two explicit knowledge bases**

Create:

- `LIVE IN HDU 新生资料库` as a document knowledge base;
- `LIVE IN HDU 已审核FAQ` as an FAQ knowledge base.

Initialize both with the same embedding model. Store their returned IDs as `WEKNORA_DOCUMENT_KB_ID` and `WEKNORA_FAQ_KB_ID`.

- [ ] **Step 7: Verify the exposed surface**

Run:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
Invoke-RestMethod 'http://127.0.0.1:8888/search?q=杭州电子科技大学&format=json'
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 5432,6379,50051,8080,8081,8888
```

Expected: WeKnora and SearXNG respond; WeKnora ports bind to loopback; PostgreSQL, Redis, and DocReader are not host-published.

- [x] **Step 8: Commit scripts and runbook, never secrets**

```powershell
git add scripts/start-knowledge-stack.ps1 scripts/stop-knowledge-stack.ps1 deploy/local/compose.weknora.override.yml deploy/local/README.md
git commit -m "chore: add secured pinned WeKnora lifecycle"
```

---

### Task 5: Implement the WeKnora Knowledge Provider

**Files:**
- Create: `apps/freshman-mvp/src/providers/weknora-provider.ts`
- Create: `apps/freshman-mvp/scripts/check-weknora.mts`
- Modify: `apps/freshman-mvp/src/providers/contracts.ts`
- Modify: `apps/freshman-mvp/src/server/config.ts`
- Modify: `apps/freshman-mvp/src/server/index.ts`
- Test: `apps/freshman-mvp/test/weknora-provider.test.ts`

**Interfaces:**
- Consumes: `POST /api/v1/knowledge-search`, `X-API-Key`, document and FAQ KB IDs.
- Produces: `KnowledgeProvider.search(question, context)` with normalized citations and explicit availability state.

- [x] **Step 1: Write provider contract tests with fake HTTP responses**

Assert:

- request URL is `/api/v1/knowledge-search`;
- request uses `knowledge_base_ids` for both configured KBs;
- API key is sent only in `X-API-Key`;
- chunks are sorted by returned sequence and normalized to sources;
- blank content and non-finite scores are rejected;
- a result below the configured threshold is a miss;
- 401 is `configuration-error`;
- timeout, 429, and 5xx are `temporarily-unavailable`;
- error bodies and keys are not logged.

- [x] **Step 2: Run tests and verify failure**

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="WeKnora provider"
```

Expected: FAIL because the provider does not exist.

- [x] **Step 3: Define the exact knowledge contract**

```ts
export interface KnowledgeHit {
  content: string;
  score: number;
  knowledgeId: string;
  chunkId: string;
  title: string;
  sourceType: string;
}

export type ProviderStatus =
  | 'available'
  | 'not-configured'
  | 'configuration-error'
  | 'temporarily-unavailable';

export interface KnowledgeSearchResult {
  status: ProviderStatus;
  hits: KnowledgeHit[];
}

export interface KnowledgeProvider {
  search(question: string): Promise<KnowledgeSearchResult>;
}
```

`KnowledgeProvider.search` returns a miss only when status is `available` and no qualifying hit exists. Provider failure is tracked separately in health output.

- [x] **Step 4: Implement the documented API adapter**

Request:

```json
{
  "query": "用户问题",
  "knowledge_base_ids": ["kb-document-test", "kb-faq-test"]
}
```

Use a 10-second timeout, maximum 8 hits, a configuration-driven score threshold, and safe JSON parsing. Normalize citations as:

```ts
{
  type: 'community',
  title: hit.knowledge_title,
  url: '',
  updatedAt: null
}
```

Preserve knowledge and chunk IDs in internal metadata for admin traceability.

- [x] **Step 5: Compose the real provider**

Add:

```dotenv
KNOWLEDGE_PROVIDER=local
WEKNORA_BASE_URL=http://127.0.0.1:8080/api/v1
WEKNORA_API_KEY=
WEKNORA_DOCUMENT_KB_ID=
WEKNORA_FAQ_KB_ID=
WEKNORA_SCORE_THRESHOLD=0.55
```

Select WeKnora only when `KNOWLEDGE_PROVIDER=weknora`. Missing configuration must not crash preset answers or the admin console.

- [ ] **Step 6: Run unit and local integration tests**

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="WeKnora provider"
npm --prefix apps/freshman-mvp exec -- tsx scripts/check-weknora.mts
```

Expected: unit tests pass and live check confirms both KB IDs are readable.

- [x] **Step 7: Commit the provider**

```powershell
git add apps/freshman-mvp/src/providers/contracts.ts apps/freshman-mvp/src/providers/weknora-provider.ts apps/freshman-mvp/scripts/check-weknora.mts apps/freshman-mvp/src/server/config.ts apps/freshman-mvp/src/server/index.ts apps/freshman-mvp/test/weknora-provider.test.ts apps/freshman-mvp/.env.example
git commit -m "feat: connect the business gateway to WeKnora retrieval"
```

---

### Task 6: Import an Approved and Traceable Knowledge Corpus

**Files:**
- Create: `deploy/local/knowledge-manifest.example.json`
- Create: `apps/freshman-mvp/src/services/knowledge-import-service.ts`
- Create: `apps/freshman-mvp/scripts/import-approved-knowledge.mts`
- Modify: `apps/freshman-mvp/src/db/postgres-migrations.ts`
- Test: `apps/freshman-mvp/test/knowledge-import.test.ts`
- Modify: `apps/freshman-mvp/web/views/AdminView.vue`

**Interfaces:**
- Consumes: administrator-approved manifest and files under `output/freshman-platform/approved-knowledge/`.
- Produces: idempotent WeKnora uploads, parse-status tracking, content hash records, and visible admin import status.

- [x] **Step 1: Write manifest and idempotency tests**

Manifest entries must be:

```json
{
  "version": 1,
  "items": [
    {
      "path": "2025新生指南.md",
      "title": "2025年新生指南",
      "sourceType": "community",
      "sourceUrl": "",
      "publishedAt": "2025-08-01",
      "applicableYear": 2025,
      "approvedBy": "local-admin",
      "approvedAt": "2026-07-28T12:00:00+08:00"
    }
  ]
}
```

Tests must reject path traversal, missing files, unsupported extensions, duplicate paths, blank approver, impossible dates, and changed files whose SHA-256 no longer matches an already imported version.

- [x] **Step 2: Run tests and verify failure**

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="approved knowledge manifest"
```

Expected: FAIL because the import service does not exist.

- [x] **Step 3: Implement manifest validation and import records**

Add business-database tables:

```sql
knowledge_imports
knowledge_import_events
```

Store manifest path, SHA-256, WeKnora knowledge ID, parse status, applicable year, approval identity, timestamps, and last error. Never infer approval from a file merely being present in the workspace.

- [x] **Step 4: Implement uploads through documented WeKnora endpoints**

Use:

- `POST /api/v1/knowledge-bases/:id/knowledge/file` for PDF, DOCX, XLSX, PPTX, TXT, and Markdown files;
- `POST /api/v1/knowledge-bases/:id/knowledge/manual` only for generated Markdown whose full content is already in the manifest workflow;
- `GET /api/v1/knowledge-bases/:id/knowledge` to poll `parse_status`.

Use `channel=live-in-hdu-approved`. A duplicate hash is a no-op. A changed file creates a new import version and never silently overwrites the old record.

- [ ] **Step 5: Prepare the first corpus explicitly**

Export or copy the community's `2025年新生指南` and any selected LIVE IN HDU articles into:

```text
output/freshman-platform/approved-knowledge/
```

Create `output/freshman-platform/knowledge-manifest.json` with one row per approved file. Do not bulk-import all of `最新资料`; exam papers and unrelated course files remain excluded unless separately approved and manifested.

- [ ] **Step 6: Dry-run, import, and wait for parse completion**

```powershell
npm --prefix apps/freshman-mvp exec -- tsx scripts/import-approved-knowledge.mts --manifest "..\..\output\freshman-platform\knowledge-manifest.json" --dry-run
npm --prefix apps/freshman-mvp exec -- tsx scripts/import-approved-knowledge.mts --manifest "..\..\output\freshman-platform\knowledge-manifest.json" --wait --timeout-minutes 30
```

Expected: every imported item reaches `completed`; failed or cancelled items remain visible with exact WeKnora error text and are not counted as searchable.

- [x] **Step 7: Add admin corpus status**

The admin page shows title, hash, applicable year, approval, WeKnora ID, parse state, last import time, and error. It provides retry for failed entries but cannot bypass the approved manifest.

- [ ] **Step 8: Run a retrieval evaluation set**

Create at least 20 queries whose expected source article and key fact are known. Pass criteria:

- expected source appears in top 5 for at least 16 of 20 queries;
- no query cites a file absent from the approved manifest;
- year-sensitive questions expose source year to the answer composer;
- failed imports never appear in citations.

- [x] **Step 9: Commit the import workflow**

```powershell
git add deploy/local/knowledge-manifest.example.json apps/freshman-mvp/src/db/postgres-migrations.ts apps/freshman-mvp/src/services/knowledge-import-service.ts apps/freshman-mvp/scripts/import-approved-knowledge.mts apps/freshman-mvp/test/knowledge-import.test.ts apps/freshman-mvp/web/views/AdminView.vue
git commit -m "feat: add approved and traceable knowledge imports"
```

---

### Task 7: Implement the Independent SearXNG Search Adapter

**Files:**
- Create: `apps/freshman-mvp/src/providers/searxng-provider.ts`
- Modify: `apps/freshman-mvp/src/providers/contracts.ts`
- Modify: `apps/freshman-mvp/src/server/config.ts`
- Modify: `apps/freshman-mvp/src/server/index.ts`
- Test: `apps/freshman-mvp/test/searxng-provider.test.ts`

**Interfaces:**
- Consumes: `GET http://127.0.0.1:8888/search?q=...&format=json`.
- Produces: normalized search leads for the existing third-stage answer composer.

- [x] **Step 1: Write provider tests with fake responses**

Assert:

- query and `format=json` are URL encoded;
- maximum results is 6;
- title, URL, snippet, engine list, and retrieval time are retained;
- non-HTTP(S), duplicate, blank-title, and blank-URL results are discarded;
- localhost, private-network, and credential-bearing URLs are rejected;
- timeout, 429, malformed JSON, and empty results return explicit statuses;
- provider errors never masquerade as a successful search.

- [x] **Step 2: Run tests and verify failure**

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="SearXNG provider"
```

Expected: FAIL because the provider does not exist.

- [x] **Step 3: Define the exact search contract**

```ts
export interface SearchLead {
  title: string;
  url: string;
  snippet: string;
  engines: string[];
  retrievedAt: string;
}

export interface WebSearchResult {
  status: ProviderStatus;
  leads: SearchLead[];
}

export interface SearchProvider {
  search(question: string): Promise<WebSearchResult>;
}
```

- [x] **Step 4: Implement SearXNG search**

Use a 10-second timeout and:

```text
GET /search?q=URL_ENCODED_QUERY&format=json&language=zh-CN&safesearch=1
```

Never fetch arbitrary result URLs in the first implementation. The answer model receives only SearXNG titles, snippets, URLs, and timestamps.

- [x] **Step 5: Update third-stage composition**

The TokenDance prompt must:

- distinguish search snippets from verified knowledge;
- cite only provided URLs;
- say when the sources conflict or do not establish a fact;
- avoid inventing dates, phone numbers, fees, policy, percentages, or quotas;
- produce a useful answer even when the search provider is unavailable, while clearly describing what the user can verify next;
- always preserve the exact fixed disclaimer.

The review task stores raw leads and provider status before the response is returned.

- [x] **Step 6: Configure the provider**

Add:

```dotenv
SEARCH_PROVIDER=unavailable
SEARXNG_BASE_URL=http://127.0.0.1:8888
SEARCH_TIMEOUT_MS=10000
SEARCH_MAX_RESULTS=6
```

Select SearXNG only when `SEARCH_PROVIDER=searxng`.

- [ ] **Step 7: Run unit and live tests**

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="SearXNG provider"
Invoke-RestMethod 'http://127.0.0.1:8888/search?q=杭州电子科技大学新生报到&format=json&language=zh-CN&safesearch=1'
```

Expected: unit tests pass and live response includes a `results` array; zero results are accepted as an honest search miss, not a system crash.

- [x] **Step 8: Commit the search adapter**

```powershell
git add apps/freshman-mvp/src/providers/contracts.ts apps/freshman-mvp/src/providers/searxng-provider.ts apps/freshman-mvp/src/server/config.ts apps/freshman-mvp/src/server/index.ts apps/freshman-mvp/test/searxng-provider.test.ts apps/freshman-mvp/.env.example
git commit -m "feat: add independent SearXNG fallback search"
```

---

### Task 8: Synchronize Published FAQ Answers to WeKnora Without Coupling

**Files:**
- Create: `apps/freshman-mvp/src/services/faq-sync-service.ts`
- Modify: `apps/freshman-mvp/src/db/postgres-migrations.ts`
- Modify: `apps/freshman-mvp/src/services/content-review-service.ts`
- Modify: `apps/freshman-mvp/src/server/app.ts`
- Test: `apps/freshman-mvp/test/faq-sync.test.ts`

**Interfaces:**
- Consumes: published canonical answers and WeKnora FAQ endpoints.
- Produces: retryable outbox events and matching WeKnora FAQ entries.

- [x] **Step 1: Write outbox and retry tests**

Assert:

- publishing commits the new canonical version and an outbox event in one business-database transaction;
- WeKnora downtime does not roll back the published business answer;
- successful sync records WeKnora `seq_id`;
- retries are idempotent;
- a newly approved previously-unrecorded question becomes a new intent and FAQ entry;
- rejecting a review never deletes historical answers or FAQ records.

- [x] **Step 2: Run tests and verify failure**

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="FAQ synchronization"
```

Expected: FAIL because the sync service and outbox do not exist.

- [x] **Step 3: Add the outbox schema**

Create:

```sql
integration_outbox
external_content_links
```

Outbox events use a unique idempotency key `intentId:canonicalVersion:weknora-faq`. Statuses are `pending`, `processing`, `completed`, and `failed`; attempts and last error are retained.

- [x] **Step 4: Implement documented FAQ upsert behavior**

Use:

- `POST /api/v1/knowledge-bases/:id/faq/entry` for first creation;
- `PUT /api/v1/knowledge-bases/:id/faq/entries/:seq_id` for updates;
- standard question from `QuestionIntent.question`;
- similar questions from aliases;
- negative questions from exclusion examples;
- answer array containing only the published full answer;
- `is_enabled=true`;
- `is_recommended` from featured state.

Export:

```ts
export interface FaqSyncService {
  enqueuePublishedVersion(intentId: string, canonicalVersion: number): Promise<void>;
  processBatch(limit: number): Promise<{ completed: number; failed: number }>;
  retry(outboxId: string): Promise<void>;
}
```

- [x] **Step 5: Process the outbox asynchronously**

Run a bounded background worker in the gateway:

- poll every 15 seconds;
- claim at most 10 rows with a database lease;
- retry with capped exponential delay;
- expose pending and failed counts in health output;
- provide an admin “retry now” action;
- stop gracefully with the server.

- [ ] **Step 6: Run synchronization tests and a live single-item test**

Publish one test canonical answer, verify the API response does not wait on WeKnora, wait for the outbox worker, and then:

```powershell
Invoke-RestMethod -Headers @{ 'X-API-Key'=$env:WEKNORA_API_KEY } -Uri "http://127.0.0.1:8080/api/v1/knowledge-bases/$env:WEKNORA_FAQ_KB_ID/faq/entries?keyword=校园卡"
```

Expected: the FAQ entry exists with the published answer and aliases.

- [x] **Step 7: Commit synchronization**

```powershell
git add apps/freshman-mvp/src/db/postgres-migrations.ts apps/freshman-mvp/src/services/faq-sync-service.ts apps/freshman-mvp/src/services/content-review-service.ts apps/freshman-mvp/src/server/app.ts apps/freshman-mvp/test/faq-sync.test.ts
git commit -m "feat: synchronize reviewed answers to WeKnora FAQ"
```

---

### Task 9: Add Full Lifecycle, Backup, Degradation, and End-to-End Verification

**Files:**
- Create: `scripts/test-knowledge-stack.ps1`
- Create: `scripts/backup-knowledge-stack.ps1`
- Modify: `scripts/start-freshman-platform.ps1`
- Modify: `scripts/stop-freshman-platform.ps1`
- Modify: `apps/freshman-mvp/src/server/app.ts`
- Modify: `apps/freshman-mvp/README.md`
- Modify: `README.md`
- Modify: `TASKS.md`
- Modify: `CHANGELOG.md`
- Test: `apps/freshman-mvp/test/phase-b-e2e.test.ts`

**Interfaces:**
- Consumes: complete Phase B stack.
- Produces: one-command startup, component health, restorable backups, and a verified three-stage local system.

- [ ] **Step 1: Write the full Phase B end-to-end test**

Test:

1. exact semantic variant of a published preset returns route `preset`;
2. non-preset question covered by approved WeKnora material returns route `knowledge` with citations;
3. unknown question returns route `web`, search leads, `web-unverified`, and exact disclaimer;
4. review row exists before the web response resolves;
5. 20 concurrent unknown questions get unique FIFO ordinals;
6. WeKnora stopped: preset still works and fallback still queues;
7. SearXNG stopped: fallback still returns a cautious answer and queues provider failure;
8. TokenDance timeout: the response contains no fabricated fact, retains disclaimer, and queues;
9. PostgreSQL unavailable: third-stage request returns a service error rather than an untracked success;
10. restart preserves all content, review order, sync outbox, and feedback.

- [ ] **Step 2: Run the test and verify missing lifecycle support**

```powershell
npm --prefix apps/freshman-mvp test -- --test-name-pattern="Phase B full flow"
```

Expected: FAIL until health, lifecycle, and degradation work is complete.

- [x] **Step 3: Implement component health**

Status 2026-07-28: component health is implemented and covered by focused tests.
The health route reports configuration and the latest real provider call state; it
does not invoke TokenDance or SearXNG merely to answer a health request.

`GET /api/health` returns independent states for:

```json
{
  "gateway": "healthy",
  "businessDatabase": "healthy",
  "weknora": "healthy",
  "embedding": "healthy",
  "search": "healthy",
  "tokenDance": "configured",
  "reviewQueue": {"pending": 0},
  "integrationOutbox": {"pending": 0, "failed": 0}
}
```

Do not call TokenDance on every health request; report configuration plus the latest real-call state and time.

- [x] **Step 4: Implement ordered startup and stop**

`start-knowledge-stack.ps1`:

1. runs preflight;
2. starts the business PostgreSQL container;
3. starts WeKnora and SearXNG;
4. waits for component health;
5. starts the LIVE IN HDU gateway;
6. polls `/api/health`;
7. prints user, admin, WeKnora-admin, and LAN URLs.

`stop-knowledge-stack.ps1` stops the gateway first, then WeKnora/SearXNG, then the business database, without deleting volumes.

- [x] **Step 5: Implement restorable backups**

`backup-knowledge-stack.ps1` must create a timestamped directory containing:

- `live-in-hdu.sql.gz` from `pg_dump`;
- `weknora.sql.gz` from WeKnora PostgreSQL;
- archived WeKnora `data-files` volume;
- exported LIVE IN HDU configuration with secrets redacted;
- approved knowledge manifest and hashes;
- `manifest.json` with SHA-256 for every backup file.

For a consistent WeKnora snapshot, stop only WeKnora `app` and `docreader`, run its `pg_dump`, archive `data-files`, restart the two services, and verify `/health`. The public preset path may continue through the LIVE IN HDU gateway during this short knowledge-maintenance window. Keep the latest 14 backups. Never run `docker compose down -v` in normal scripts.

- [ ] **Step 6: Perform a clean restore drill**

Restore into newly named test volumes and test ports, then verify:

- public question count and answer versions;
- pending review count and order;
- WeKnora knowledge count;
- one known retrieval query;
- outbox state;
- checksum manifest.

The original volumes remain untouched during the drill.

- [ ] **Step 7: Run all automated tests twice**

```powershell
.\scripts\test-knowledge-stack.ps1
.\scripts\test-knowledge-stack.ps1
```

Expected: both runs pass from clean gateway processes and do not duplicate imports, reviews, or FAQ entries.

- [ ] **Step 8: Perform browser and same-Wi-Fi phone acceptance**

Status 2026-07-28: the Phase A browser surface passed at 390×844 using an isolated
D-drive SQLite database, including the exact fallback disclaimer and FIFO admin row.
This does not satisfy this Phase B step: WeKnora/SearXNG/PostgreSQL were not running,
knowledge-route UI and provider degradation were not exercised, and no physical phone
was tested.

At 390×844 and on a real phone:

- question-card browsing still works;
- a preset paraphrase returns the approved answer;
- a knowledge question shows `社区知识库`, source title, and update metadata;
- an unknown question shows `联网整理·注意甄别` and the exact disclaimer;
- admin queue remains oldest-first;
- stopping WeKnora does not break preset browsing;
- restarting the complete stack preserves position-independent server data.

- [x] **Step 9: Update runbooks and status**

Document:

- exact setup, start, stop, test, import, backup, and restore commands;
- local computer must remain powered on and connected;
- how to rotate TokenDance, WeKnora, database, JWT, and SearXNG secrets;
- how to add an approved knowledge file;
- how to inspect failed parse and outbox jobs;
- the future Tencent Cloud migration boundary.

- [ ] **Step 10: Commit the verified Phase B system**

```powershell
git add apps/freshman-mvp scripts deploy/local README.md TASKS.md CHANGELOG.md
git commit -m "feat: deliver complete local knowledge agent platform"
```

---

## Phase B Completion Gate

Do not call the local knowledge platform complete until all are true:

- The business application runs on its own PostgreSQL database and all SQLite data reconciles.
- WeKnora 0.7.0 runs from the pinned baseline and is accessed only through documented REST APIs.
- Only approved, manifested documents are searchable.
- The `2025年新生指南` is imported, parsed, and covered by the retrieval evaluation.
- Published canonical answers synchronize to the WeKnora FAQ through a retryable outbox.
- SearXNG returns normalized leads through the independent `SearchProvider`.
- Preset, knowledge, and web routes pass with their exact trust labels and citations.
- Every third-stage response is persisted before return and carries the exact disclaimer.
- Administrator absence, WeKnora failure, SearXNG failure, and TokenDance timeout do not erase or silently lose questions.
- PostgreSQL failure prevents untracked third-stage success.
- Backup and clean restore drills pass.
- The full test script passes twice consecutively.
- Edge mobile viewport and a same-Wi-Fi phone pass the acceptance checklist.
