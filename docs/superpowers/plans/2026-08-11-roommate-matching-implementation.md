# LIVE IN HDU Roommate Matching V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure XiaSha dorm registration and same-room member discovery flow to the existing LIVE IN HDU application while preserving the current Q&A data, routes, and local-only administration boundary.

**Architecture:** Add a bounded `roommates` domain inside the current Fastify process, backed by new additive SQLite tables and exposed through session-protected APIs. Add one Vue route for registration/recovery/member management and one local-only admin panel; keep the feature disabled until trusted HTTPS and server-side secrets are configured.

**Tech Stack:** Node.js 24, TypeScript, Fastify 5, `@fastify/cookie`, built-in `node:crypto`, built-in `node:sqlite`, Vue 3, Vue Router 4, Vitest, Node test runner.

## Global Constraints

- V1 supports XiaSha only: building number, south/north orientation, and room number.
- Shaoxing is visible as `寝室分配规则确认中，暂未开放匹配` and cannot submit.
- A user must own an active registration for a room before reading that room's member list.
- Nickname is required; real name is not requested; contact is optional and limited to one of WeChat, QQ, phone, or other.
- Contact consent is required only when a contact is present.
- Registrations publish immediately and never enter the Q&A review queue.
- There is no fixed per-room member cap in V1.
- Each registration expires after exactly 90 days; expiry hides it and erases contact ciphertext and contact digest.
- The management code is returned once, stored only as a digest, and recovery requires registration ID plus management code.
- Browser sessions use `Secure`, `HttpOnly`, `SameSite=Strict` cookies and server-side session digests.
- Room address, nickname, and contact are encrypted at rest; room and building lookup keys use HMAC.
- The client has no `联系我们` link in V1.
- Roommate admin APIs remain covered by the existing loopback-only `/api/admin/*` boundary.
- The public roommate feature remains disabled until trusted HTTPS is configured; existing Q&A keeps working while disabled.
- Existing Q&A, knowledge, review, and publication tables must not be dropped, renamed, rewritten, or reseeded.
- Existing unrelated dirty files in the worktree must not be staged or reformatted.

---

## Planned File Structure

Create focused units rather than adding roommate responsibilities to the already large server and admin files:

- `src/roommates/models.ts`: public domain types and repository contracts.
- `src/roommates/address-templates.ts`: campus template registry, validation, normalization, display value, and canonical address.
- `src/roommates/crypto.ts`: AES-256-GCM field encryption, HMAC lookup keys, management/session token generation and digests.
- `src/roommates/rate-limit.ts`: bounded in-memory sliding-window limiter for creation, recovery, and member reads.
- `src/roommates/service.ts`: create/read/update/delete/recover/list/retain policy and access decisions.
- `src/repositories/sqlite-roommate-repository.ts`: SQLite persistence only for roommate tables.
- `web/views/RoommateView.vue`: page-level state machine.
- `web/components/RoommateRegistrationForm.vue`: campus/address/nickname/contact/consent form.
- `web/components/RoommateMemberList.vue`: own record, member list, edit/delete controls, and one-time recovery credential.
- `web/components/RoommateRecoveryForm.vue`: registration ID plus management code recovery.
- `web/components/AdminRoommatePanel.vue`: local-only operational list and moderation actions.
- `scripts/verify-roommate-readiness.mts`: non-destructive HTTPS/config/API readiness probe.
- `deploy/nginx/liveinhdu.cn.conf.example`: reviewed reverse-proxy template.
- `docs/ROOMMATE_OPERATIONS.md`: backup, secret generation, enablement, verification, and rollback runbook.

---

### Task 1: Address Templates and Cryptographic Primitives

**Files:**
- Create: `apps/freshman-mvp/src/roommates/models.ts`
- Create: `apps/freshman-mvp/src/roommates/address-templates.ts`
- Create: `apps/freshman-mvp/src/roommates/crypto.ts`
- Test: `apps/freshman-mvp/test/roommate-domain.test.ts`

**Interfaces:**
- Produces: `normalizeRoomAddress(input: RoomAddressInput): NormalizedRoomAddress`
- Produces: `listCampusTemplates(): CampusTemplateSummary[]`
- Produces: `RoommateCrypto` with `encrypt`, `decrypt`, `roomKey`, `buildingKey`, `contactDigest`, `managementDigest`, `sessionDigest`, `newManagementCode`, and `newSessionToken`.
- Consumes: Node `crypto` only; no database or Fastify dependency.

- [ ] **Step 1: Write failing address-template tests**

```ts
test('normalizes XiaSha room identity without hard-coding a building list', () => {
  const room = normalizeRoomAddress({
    campus: 'xiasha', building: '011', orientation: 'south', room: '0207',
  });
  assert.deepEqual(room, {
    campus: 'xiasha', templateVersion: 'xiasha-v1', building: '11',
    orientation: 'south', room: '207',
    canonical: 'xiasha|xiasha-v1|11|south|207',
    display: '下沙校区 · 11号楼 · 南 · 207',
  });
});

test('keeps Shaoxing visible but rejects registration', () => {
  assert.equal(listCampusTemplates().find((item) => item.code === 'shaoxing')?.enabled, false);
  assert.throws(
    () => normalizeRoomAddress({ campus: 'shaoxing', building: '1', orientation: 'south', room: '101' }),
    /暂未开放/,
  );
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx tsx --test test/roommate-domain.test.ts`

Expected: FAIL because the roommate domain modules do not exist.

- [ ] **Step 3: Implement exact domain types and XiaSha normalization**

Define these public types in `models.ts`:

```ts
export type CampusCode = 'xiasha' | 'shaoxing';
export type RoomOrientation = 'south' | 'north';
export type ContactType = 'wechat' | 'qq' | 'phone' | 'other';
export type RoommateStatus = 'active' | 'hidden' | 'deleted' | 'expired';

export interface RoomAddressInput {
  campus: CampusCode;
  building: string;
  orientation: RoomOrientation;
  room: string;
}

export interface NormalizedRoomAddress extends RoomAddressInput {
  templateVersion: 'xiasha-v1';
  canonical: string;
  display: string;
}
```

`address-templates.ts` must reject zero/negative buildings, blank rooms, control characters, unsupported orientations, and Shaoxing submission. It must accept numeric or uppercase alphanumeric room values of 1–10 characters and normalize pure numeric leading zeroes.

- [ ] **Step 4: Add failing crypto round-trip and no-plaintext tests**

```ts
test('encrypts authenticated fields and derives stable non-plaintext indexes', () => {
  const crypto = new RoommateCrypto({
    encryptionKey: Buffer.alloc(32, 7), hmacKey: Buffer.alloc(32, 9),
  });
  const ciphertext = crypto.encrypt('下沙校区 · 11号楼 · 南 · 207');
  assert.doesNotMatch(ciphertext, /11号楼|207/);
  assert.equal(crypto.decrypt(ciphertext), '下沙校区 · 11号楼 · 南 · 207');
  assert.equal(crypto.roomKey('same'), crypto.roomKey('same'));
  assert.notEqual(crypto.roomKey('same'), crypto.roomKey('other'));
});
```

- [ ] **Step 5: Implement `RoommateCrypto` with AES-256-GCM and HMAC-SHA256**

Use a fresh 12-byte IV per encryption and serialize `version.iv.tag.ciphertext` in base64url. Use domain-separated HMAC inputs such as `room\0${canonical}`, `building\0${campus}|${building}`, `contact\0${type}|${normalizedValue}`, `management\0${code}`, and `session\0${token}`. Generate at least 32 random bytes for management codes and session tokens. Reject malformed ciphertext without leaking its contents.

- [ ] **Step 6: Run tests and commit**

Run: `npx tsx --test test/roommate-domain.test.ts`

Expected: PASS.

Commit:

```powershell
git add apps/freshman-mvp/src/roommates/models.ts apps/freshman-mvp/src/roommates/address-templates.ts apps/freshman-mvp/src/roommates/crypto.ts apps/freshman-mvp/test/roommate-domain.test.ts
git commit -m "feat: add roommate address and crypto domain"
```

---

### Task 2: Additive SQLite Schema and Repository

**Files:**
- Modify: `apps/freshman-mvp/src/db/migrations.ts:1-145`
- Create: `apps/freshman-mvp/src/repositories/sqlite-roommate-repository.ts`
- Test: `apps/freshman-mvp/test/roommate-repository.test.ts`

**Interfaces:**
- Consumes: `RoommateRegistrationRecord`, `RoommateSessionRecord`, `RoommateAdminAuditRecord`, and `RoommateRepository` from `src/roommates/models.ts`.
- Produces: `SqliteRoommateRepository implements RoommateRepository`.
- Repository methods: `createRegistration`, `getRegistration`, `getRegistrationBySessionDigest`, `listActiveMembers`, `updateRegistration`, `createSession`, `revokeSessions`, `expireDue`, `listAdmin`, `moderate`, and `appendAudit`.

- [ ] **Step 1: Extend `models.ts` with persistence contracts and write failing repository tests**

The repository test must create an in-memory database, run `migrateDatabase`, seed one existing Q&A intent, add roommate data, close/reopen a temporary file database, and assert both domains survive.

```ts
test('migration adds roommate tables without changing existing Q&A rows', () => {
  const db = openDatabase(':memory:');
  migrateDatabase(db);
  const names = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  ).all().map((row) => String((row as { name: string }).name));
  assert.ok(names.includes('roommate_registrations'));
  assert.ok(names.includes('roommate_sessions'));
  assert.ok(names.includes('roommate_admin_audit'));
  assert.ok(names.includes('question_intents'));
});
```

- [ ] **Step 2: Run the focused repository test and confirm RED**

Run: `npx tsx --test test/roommate-repository.test.ts`

Expected: FAIL because migration version 4 and the repository do not exist.

- [ ] **Step 3: Add migration version 4 inside the existing transaction**

Create only new tables and indexes:

```sql
CREATE TABLE IF NOT EXISTS roommate_registrations (
  id TEXT PRIMARY KEY,
  campus_code TEXT NOT NULL,
  template_version TEXT NOT NULL,
  room_key TEXT NOT NULL,
  building_key TEXT NOT NULL,
  address_ciphertext TEXT NOT NULL,
  nickname_ciphertext TEXT NOT NULL,
  contact_type TEXT,
  contact_ciphertext TEXT,
  contact_digest TEXT,
  management_digest TEXT NOT NULL UNIQUE,
  consent_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','hidden','deleted','expired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS roommate_registrations_room_status
  ON roommate_registrations(room_key, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS roommate_registrations_active_contact
  ON roommate_registrations(contact_digest)
  WHERE contact_digest IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS roommate_sessions (
  session_digest TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES roommate_registrations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roommate_admin_audit (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Record schema migration version `4`. Do not modify or reseed existing rows.

- [ ] **Step 4: Implement prepared-statement repository methods**

Map database rows to typed records in one private function. All create/update/moderate operations use explicit transactions. `listActiveMembers(roomKey, now)` must select only `status='active' AND expires_at > ?`. `expireDue(now)` must atomically set `status='expired'`, null contact fields, and delete sessions for affected registrations.

- [ ] **Step 5: Verify persistence, expiry, and Q&A preservation**

Run: `npx tsx --test test/roommate-repository.test.ts test/sqlite-repositories.test.ts`

Expected: PASS with roommate rows preserved across reopen and all existing repository tests unchanged.

- [ ] **Step 6: Commit**

```powershell
git add apps/freshman-mvp/src/db/migrations.ts apps/freshman-mvp/src/roommates/models.ts apps/freshman-mvp/src/repositories/sqlite-roommate-repository.ts apps/freshman-mvp/test/roommate-repository.test.ts
git commit -m "feat: persist roommate registrations in sqlite"
```

---

### Task 3: Roommate Service, Sessions, Retention, and Abuse Limits

**Files:**
- Create: `apps/freshman-mvp/src/roommates/rate-limit.ts`
- Create: `apps/freshman-mvp/src/roommates/service.ts`
- Test: `apps/freshman-mvp/test/roommate-service.test.ts`

**Interfaces:**
- Consumes: `RoommateRepository`, `RoommateCrypto`, and `normalizeRoomAddress`.
- Produces: `RoommateService` methods `create`, `getMine`, `updateMine`, `deleteMine`, `recover`, `listMembers`, `listAdmin`, `revealAdminContact`, `moderate`, and `runRetention`.
- Each authenticated method accepts a session token; recovery accepts registration ID plus management code; admin methods accept actor `local-admin` and nonblank reason.

- [ ] **Step 1: Write failing service tests for the complete access matrix**

Cover these exact assertions:

```ts
test('only an active same-room registration can read member contacts', async () => {
  const first = await service.create(xiashaInput('11', 'south', '207', '小燃', 'wechat', 'wx-a'), ctxA);
  const second = await service.create(xiashaInput('11', 'south', '207', '小点', null, null), ctxB);
  await service.create(xiashaInput('11', 'north', '207', '隔壁', 'qq', '12345'), ctxC);
  const members = await service.listMembers(first.sessionToken, ctxA);
  assert.deepEqual(members.map((item) => item.nickname), ['小燃', '小点']);
  assert.equal(members[0]?.contact?.value, 'wx-a');
  await assert.rejects(() => service.listMembers('invalid', ctxA), /session/i);
  assert.equal(second.managementCode.length > 30, true);
});
```

Also test: missing consent with contact, no-contact success, same-session create returns existing record, duplicate active contact conflicts, room change revokes old room access, hidden/deleted/expired cannot list, correct recovery succeeds, wrong recovery returns the same public error, and no fixed member cap.

- [ ] **Step 2: Run service tests and confirm RED**

Run: `npx tsx --test test/roommate-service.test.ts`

Expected: FAIL because `RoommateService` and rate limiting do not exist.

- [ ] **Step 3: Implement a bounded sliding-window limiter**

Define named policies:

```ts
const ROOMMATE_RATE_POLICIES = {
  create: { limit: 5, windowMs: 60 * 60 * 1000 },
  recover: { limit: 10, windowMs: 15 * 60 * 1000 },
  members: { limit: 120, windowMs: 60 * 1000 },
} as const;
```

Keys are HMAC-derived from the request IP plus action; never store raw IPs. Prune expired buckets on access and cap the in-memory map to a fixed maximum so attackers cannot grow it indefinitely.

- [ ] **Step 4: Implement service validation and response minimization**

Creation must:

1. enforce the create limiter;
2. return the existing active registration when the supplied valid session already owns one;
3. normalize room data server-side;
4. validate nickname length 1–30 Unicode code points and reject controls;
5. validate contact type/value pair and consent;
6. encrypt address, nickname, and optional contact;
7. persist 90-day expiry;
8. create a 90-day session;
9. return registration ID, one-time management code, session token, own view, and members without exposing digests or ciphertext.

Recovery must perform one public error path for missing ID and wrong code and use constant-time digest comparison. Update must preserve the original registration ID and creation time. Delete and expiry must erase contact data and revoke all sessions.

- [ ] **Step 5: Implement admin moderation and audit behavior**

`moderate(id, { action, actorId, reason })` permits `hide`, `restore`, and `delete`. Restore is allowed only for hidden, unexpired records. Delete erases contact data. Every successful action appends an audit row in the same transaction. `revealAdminContact(id, actorId, reason)` returns one decrypted contact only after a nonblank reason and appends a `view_contact` audit row; list results remain masked.

- [ ] **Step 6: Run focused service and repository tests**

Run: `npx tsx --test test/roommate-domain.test.ts test/roommate-repository.test.ts test/roommate-service.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/freshman-mvp/src/roommates/rate-limit.ts apps/freshman-mvp/src/roommates/service.ts apps/freshman-mvp/test/roommate-service.test.ts
git commit -m "feat: add roommate registration service"
```

---

### Task 4: Secure Configuration and Production Runtime Wiring

**Files:**
- Modify: `apps/freshman-mvp/src/server/config.ts:3-74`
- Modify: `apps/freshman-mvp/src/server/index.ts:186-451`
- Modify: `apps/freshman-mvp/.env.example`
- Modify: `apps/freshman-mvp/package.json`
- Modify: `apps/freshman-mvp/package-lock.json`
- Test: `apps/freshman-mvp/test/roommate-config.test.ts`
- Test: `apps/freshman-mvp/test/roommate-runtime.test.ts`

**Interfaces:**
- Produces an optional, backward-compatible `AppConfig.roommate` block with `requested`, `publicOrigin`, `encryptionKey`, `hmacKey`, `cookieSecret`, and `secure`. `loadConfig` always supplies the block; the property remains optional so existing narrow test fixtures and callers do not require edits.
- Produces optional `roommates: RoommateService | null` dependency for `createApp`.
- Produces health component `roommateMatching` with status `disabled`, `configuration-error`, or `available` and no secret material.

- [ ] **Step 1: Write RED config tests**

```ts
test('keeps roommate matching disabled by default', () => {
  const config = loadConfig({}, 'C:/project/apps/freshman-mvp');
  assert.equal(config.roommate?.requested, false);
  assert.equal(config.roommate?.secure, false);
});

test('marks roommate configuration secure only with HTTPS and three valid secrets', () => {
  const key = Buffer.alloc(32, 1).toString('base64');
  const config = loadConfig({
    ROOMMATE_MATCHING_ENABLED: 'true',
    ROOMMATE_PUBLIC_ORIGIN: 'https://liveinhdu.cn',
    ROOMMATE_ENCRYPTION_KEY: key,
    ROOMMATE_HMAC_KEY: Buffer.alloc(32, 2).toString('base64'),
    ROOMMATE_COOKIE_SECRET: Buffer.alloc(32, 3).toString('base64'),
  }, 'C:/project/apps/freshman-mvp');
  assert.equal(config.roommate?.secure, true);
});
```

- [ ] **Step 2: Run config tests and confirm RED**

Run: `npx tsx --test test/roommate-config.test.ts`

Expected: FAIL because the config fields do not exist.

- [ ] **Step 3: Add fail-closed configuration parsing**

Only the literal value `true` requests enablement. `roommate.secure` is true only when the public origin parses as HTTPS and all three base64 secrets decode to at least 32 bytes. Missing or invalid roommate secrets must leave Q&A running with roommate status `configuration-error`; no error text may include the secret values. `createApp` and runtime code treat an absent optional `roommate` block as disabled, preserving compatibility with existing test fixtures without modifying unrelated dirty test files.

Add documented blank variables to `.env.example`:

```dotenv
ROOMMATE_MATCHING_ENABLED=false
ROOMMATE_PUBLIC_ORIGIN=https://liveinhdu.cn
ROOMMATE_ENCRYPTION_KEY=
ROOMMATE_HMAC_KEY=
ROOMMATE_COOKIE_SECRET=
```

- [ ] **Step 4: Install and lock the Fastify cookie plugin**

Run: `npm install @fastify/cookie@^11`

Expected: `package.json` and `package-lock.json` contain the compatible dependency and no unrelated package upgrades.

- [ ] **Step 5: Wire SQLite roommate service without affecting PostgreSQL mode**

When SQLite and `config.roommate?.secure` are active, construct `SqliteRoommateRepository`, `RoommateCrypto`, limiter, and `RoommateService`. When disabled, malformed, or running the current PostgreSQL path, pass `null` and expose an honest health status. Add a single unref'd hourly retention timer only when the service exists; clear it during runtime close and startup failure.

- [ ] **Step 6: Test runtime startup, shutdown, and unchanged Q&A health**

The runtime test must prove disabled/malformed roommate config still serves `/api/questions`, valid config initializes new tables, the retention timer does not keep Node alive, and closing the runtime closes SQLite exactly once.

Run: `npx tsx --test test/roommate-config.test.ts test/roommate-runtime.test.ts test/baseline.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/freshman-mvp/src/server/config.ts apps/freshman-mvp/src/server/index.ts apps/freshman-mvp/.env.example apps/freshman-mvp/package.json apps/freshman-mvp/package-lock.json apps/freshman-mvp/test/roommate-config.test.ts apps/freshman-mvp/test/roommate-runtime.test.ts
git commit -m "feat: configure roommate runtime safely"
```

---

### Task 5: Fastify Roommate APIs, HTTPS Gate, and Cookies

**Files:**
- Modify: `apps/freshman-mvp/src/server/app.ts:1-290`
- Test: `apps/freshman-mvp/test/roommate-api.test.ts`

**Interfaces:**
- Consumes: optional `RoommateService` and config from Task 4.
- Produces the public and admin endpoints named in the design spec.
- Cookie name: `live_in_hdu_roommate`; path `/api/roommates`; max age 90 days.

- [ ] **Step 1: Write RED API tests for public configuration and disabled behavior**

```ts
test('returns templates but refuses sensitive roommate operations while disabled', async () => {
  const config = await app.inject({ method: 'GET', url: '/api/roommates/config' });
  assert.equal(config.statusCode, 200);
  assert.equal(config.json().enabled, false);
  assert.equal(config.json().campuses.find((x: { code: string }) => x.code === 'shaoxing').enabled, false);
  const create = await app.inject({ method: 'POST', url: '/api/roommates/registrations', payload: validInput });
  assert.equal(create.statusCode, 503);
});
```

- [ ] **Step 2: Add RED tests for HTTPS, cookie flags, access isolation, and local-only admin**

Use `remoteAddress: '127.0.0.1'` plus `x-forwarded-proto: https` to represent trusted Nginx and a non-loopback remote address to prove spoofed forwarded headers do not bypass HTTPS/admin checks. Assert creation returns `Set-Cookie` with `Secure`, `HttpOnly`, `SameSite=Strict`, and does not put the session token in JSON.

- [ ] **Step 3: Run API tests and confirm RED**

Run: `npx tsx --test test/roommate-api.test.ts`

Expected: FAIL because no roommate routes are registered.

- [ ] **Step 4: Register cookie support and trusted-proxy protocol handling**

Configure Fastify to trust forwarded protocol only from loopback proxy addresses. Add one guard for sensitive `/api/roommates/*` routes that requires both an available service and `request.protocol === 'https'`. Keep `/api/roommates/config` public and non-sensitive, but report `enabled: false` when the current request is not trusted HTTPS. Verify the signed cookie with `request.unsignCookie` before passing its value to the service. Do not weaken the existing raw socket IP check for `/api/admin/*` and `/api/reviews/*`.

- [ ] **Step 5: Add strict request parsers and route handlers**

Handlers must use existing `ValidationError`, `ConflictError`, `NotFoundError`, and `ServiceUnavailableError`. Parse only documented fields, reject arrays/unknown enum values, and cap request strings before service calls. Session tokens come only from the signed cookie. Successful create/recover rotate the cookie; delete clears it.

- [ ] **Step 6: Add admin endpoints under the existing loopback hook**

```text
GET  /api/admin/roommates?campus=&status=&building=&orientation=&room=
POST /api/admin/roommates/:id/reveal-contact
POST /api/admin/roommates/:id/moderate
```

The reveal body is `{ reason: string }`. The moderation body is `{ action: 'hide' | 'restore' | 'delete', reason: string }`. The server supplies actor `local-admin` for both operations and ignores any client actor field.

- [ ] **Step 7: Run API security and existing boundary tests**

Run: `npx tsx --test test/roommate-api.test.ts test/api-v2.test.ts`

Expected: PASS, including existing remote 403 checks for admin and review routes.

- [ ] **Step 8: Commit**

```powershell
git add apps/freshman-mvp/src/server/app.ts apps/freshman-mvp/test/roommate-api.test.ts
git commit -m "feat: expose secure roommate APIs"
```

---

### Task 6: Client API Contract, Route, and Navigation Entry

**Files:**
- Modify: `apps/freshman-mvp/web/api.ts:1-560`
- Modify: `apps/freshman-mvp/web/router.ts:8-39`
- Modify: `apps/freshman-mvp/src/server/app.ts:110-115`
- Modify: `apps/freshman-mvp/web/views/QuestionDeckView.vue:136-154`
- Test: `apps/freshman-mvp/test/web/roommate-routing.test.ts`
- Modify test: `apps/freshman-mvp/test/web/question-deck.test.ts`

**Interfaces:**
- Produces frontend types `RoommateConfig`, `RoommateSelf`, `RoommateMember`, `RoommateRecoveryCredential`, `RoommateAdminItem`.
- Produces API functions `getRoommateConfig`, `createRoommateRegistration`, `getMyRoommateRegistration`, `updateMyRoommateRegistration`, `deleteMyRoommateRegistration`, `recoverRoommateRegistration`, and `listRoommateMembers`.
- Produces Vue route name `roommates` at `/roommates`.

- [ ] **Step 1: Write RED router and navigation tests**

Assert that `/roommates` resolves to the roommate view and that the question header actions render in this exact order: `匹配室友`, `新生指北`, `全部问题`.

```ts
expect(wrapper.findAll('.deck-header-actions > *').map((node) => node.text()))
  .toEqual(['匹配室友', '新生指北', '全部问题']);
```

- [ ] **Step 2: Run the focused web test and confirm RED**

Run: `npx vitest run test/web/roommate-routing.test.ts test/web/question-deck.test.ts`

Expected: FAIL because the route and entry do not exist.

- [ ] **Step 3: Add narrow runtime validators and API functions**

Every response must be validated before the Vue layer uses it. Requests include `credentials: 'same-origin'`; no function accepts or returns a raw session token. On non-2xx responses, reuse `ApiResponseError` and expose only safe status-based UI messages.

- [ ] **Step 4: Add lazy route and SPA fallback**

Add a lazy import for `RoommateView.vue`, add `/roommates` to the server's index fallback route list, and place the new router link before the existing guide link.

- [ ] **Step 5: Run focused web tests and typecheck**

Run: `npx vitest run test/web/roommate-routing.test.ts test/web/question-deck.test.ts`

Run: `npx vue-tsc --noEmit -p tsconfig.json`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/freshman-mvp/web/api.ts apps/freshman-mvp/web/router.ts apps/freshman-mvp/src/server/app.ts apps/freshman-mvp/web/views/QuestionDeckView.vue apps/freshman-mvp/test/web/roommate-routing.test.ts apps/freshman-mvp/test/web/question-deck.test.ts
git commit -m "feat: add roommate client route"
```

---

### Task 7: Mobile Registration, Recovery, and Member UI

**Files:**
- Create: `apps/freshman-mvp/web/views/RoommateView.vue`
- Create: `apps/freshman-mvp/web/components/RoommateRegistrationForm.vue`
- Create: `apps/freshman-mvp/web/components/RoommateMemberList.vue`
- Create: `apps/freshman-mvp/web/components/RoommateRecoveryForm.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/roommate-view.test.ts`

**Interfaces:**
- Consumes the Task 6 API functions only; components do not call `fetch` directly.
- `RoommateRegistrationForm` emits `submit` with documented fields and `recover` when the user chooses recovery.
- `RoommateMemberList` emits `edit` and `delete`; it accepts the one-time credential only immediately after create.

- [ ] **Step 1: Write RED component tests for the user-visible flow**

Test the exact sequence:

1. feature-disabled state explains HTTPS/setup without exposing configuration details;
2. Shaoxing selection shows the confirmed unavailable copy and disables submit;
3. XiaSha renders building, south/north, room, nickname, optional contact type/value, and conditional consent;
4. confirmation shows `下沙校区 · 11号楼 · 南 · 207`;
5. successful create shows registration ID, one-time management code, and same-room members;
6. one member without contact shows `暂未留下联系方式`;
7. update preserves the record; delete requires confirmation;
8. recovery requires both fields and never stores the management code in local or session storage;
9. API failure preserves entered values and enables retry;
10. the roommate route installs `robots=noindex,nofollow` while mounted and restores the previous document metadata when leaving.

- [ ] **Step 2: Run the focused Vue test and confirm RED**

Run: `npx vitest run test/web/roommate-view.test.ts`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement `RoommateView` as an explicit state machine**

Use states `loading`, `disabled`, `register`, `confirm`, `credential`, `members`, `recover`, and `error`. On mount, load config and then attempt `getMyRoommateRegistration`; treat 401 as “no current registration,” not as a page failure. Keep input state in Vue refs only.

- [ ] **Step 4: Implement accessible forms and sensitive-data behavior**

All controls have visible labels and error associations. Never render contact values into data attributes. Use text interpolation, not HTML injection. The management code block is displayed once with a copy button; leaving the state removes it from the DOM. Do not write it to browser storage or analytics. Display the approved nonofficial-service, self-reported-identity, 90-day retention, optional-contact, and prohibited-sensitive-information copy beside the form. While the roommate view is mounted, create or update a `meta[name="robots"]` tag to `noindex,nofollow`; restore its previous value or remove the temporary tag on unmount.

- [ ] **Step 5: Add responsive styles without changing existing page geometry**

Use relative/flex/grid layout, `min-width: 0`, viewport-safe bottom padding, and existing color/font tokens. Test at 320 px and 430 px widths. The keyboard-visible form must keep the focused input and submit area reachable using normal document scrolling; do not use a fixed-height modal.

- [ ] **Step 6: Run Vue tests, typecheck, and existing deck/chat regressions**

Run: `npx vitest run test/web/roommate-view.test.ts test/web/question-deck.test.ts test/web/chat-guide-sources.test.ts`

Run: `npx vue-tsc --noEmit -p tsconfig.json`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/freshman-mvp/web/views/RoommateView.vue apps/freshman-mvp/web/components/RoommateRegistrationForm.vue apps/freshman-mvp/web/components/RoommateMemberList.vue apps/freshman-mvp/web/components/RoommateRecoveryForm.vue apps/freshman-mvp/web/styles/tokens.css apps/freshman-mvp/test/web/roommate-view.test.ts
git commit -m "feat: build roommate matching client flow"
```

---

### Task 8: Local-Only Roommate Administration

**Files:**
- Create: `apps/freshman-mvp/web/components/AdminRoommatePanel.vue`
- Modify: `apps/freshman-mvp/web/views/AdminView.vue:1-310`
- Modify: `apps/freshman-mvp/web/api.ts`
- Test: `apps/freshman-mvp/test/web/roommate-admin.test.ts`

**Interfaces:**
- Consumes `listAdminRoommates(filters)` and `moderateRoommate(id, action, reason)` from `web/api.ts`.
- Produces an independent management section with filters, masked list, explicit reveal, and moderation controls.

- [ ] **Step 1: Write RED admin component tests**

Assert newest-first rendering, campus/status/exact-address filters, masked contact by default, explicit reveal, required reason, hide/restore/delete actions, refresh after success, and safe 403 “仅允许在本机打开” behavior.

- [ ] **Step 2: Run the focused admin test and confirm RED**

Run: `npx vitest run test/web/roommate-admin.test.ts`

Expected: FAIL because the admin component and API functions do not exist.

- [ ] **Step 3: Add admin response validators and operations**

`RoommateAdminItem` includes registration ID, display address, nickname, masked contact, optional revealed contact, status, timestamps, and last moderation metadata. Never expose management/session digests. Moderation sends only action and reason; actor remains server-controlled.

- [ ] **Step 4: Implement the panel as a separate section**

Do not merge records into `AdminReviewQueue`. Load roommate data independently so a roommate API failure does not block content review. The “查看完整联系方式” action must be deliberate and visibly marked as sensitive; it calls a local-only detail endpoint and does not cache the response in browser storage.

- [ ] **Step 5: Run admin UI and backend boundary regressions**

Run: `npx vitest run test/web/roommate-admin.test.ts test/web/admin.test.ts`

Run: `npx tsx --test test/roommate-api.test.ts test/api-v2.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/freshman-mvp/web/components/AdminRoommatePanel.vue apps/freshman-mvp/web/views/AdminView.vue apps/freshman-mvp/web/api.ts apps/freshman-mvp/test/web/roommate-admin.test.ts
git commit -m "feat: add local roommate operations panel"
```

---

### Task 9: Deployment Readiness Probe and Operations Runbook

**Files:**
- Create: `apps/freshman-mvp/scripts/verify-roommate-readiness.mts`
- Create: `apps/freshman-mvp/deploy/nginx/liveinhdu.cn.conf.example`
- Create: `apps/freshman-mvp/docs/ROOMMATE_OPERATIONS.md`
- Modify: `apps/freshman-mvp/package.json`
- Test: `apps/freshman-mvp/test/roommate-readiness-script.test.ts`

**Interfaces:**
- Produces command `npm run verify:roommates -- --base-url https://liveinhdu.cn`.
- Probe is read-only by default and never creates a registration or prints secrets.

- [ ] **Step 1: Write RED subprocess tests for the readiness probe**

Use a local fake HTTP server to assert the script:

- exits nonzero for an HTTP base URL;
- exits nonzero when config says disabled;
- exits nonzero when cookies/security headers are absent from a non-mutating probe response;
- exits zero only for HTTPS configuration, enabled feature status, expected XiaSha/Shaoxing templates, and protected admin behavior;
- never prints environment secret values.

- [ ] **Step 2: Run the focused script test and confirm RED**

Run: `npx tsx --test test/roommate-readiness-script.test.ts`

Expected: FAIL because the script and npm command do not exist.

- [ ] **Step 3: Implement the non-destructive verifier**

The command reads only public config/health endpoints and a deliberately unauthenticated member request. It must expect member access to be denied, public admin access to be denied, and must not submit user data.

- [ ] **Step 4: Add the reviewed Nginx template**

The example must:

```nginx
server {
  listen 80;
  server_name liveinhdu.cn www.liveinhdu.cn;
  return 301 https://liveinhdu.cn$request_uri;
}

server {
  listen 443 ssl http2;
  server_name liveinhdu.cn;
  # certificate paths are installed by the server operator
  location / {
    proxy_pass http://127.0.0.1:3210;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

The committed example must contain no real certificate, private key, API key, or cookie secret.

- [ ] **Step 5: Write exact operator steps**

`ROOMMATE_OPERATIONS.md` must cover: Tencent domain ownership and ICP prerequisite; SQLite online backup command; a finite backup retention rule so erased contact data is not retained indefinitely; three independent 32-byte base64 secret generation commands that do not echo existing secrets; environment file permissions; build; disabled first deployment; Nginx syntax test; loopback bind; health check; readiness command; enable/restart; phone acceptance flow; rollback by disabling the feature and restoring code; database restore only if integrity or counts changed.

- [ ] **Step 6: Run script tests and leak scan**

Run: `npx tsx --test test/roommate-readiness-script.test.ts`

Run: `Select-String -Path scripts/verify-roommate-readiness.mts,deploy/nginx/liveinhdu.cn.conf.example,docs/ROOMMATE_OPERATIONS.md -Pattern 'sk-[A-Za-z0-9]{16,}|TOKENDANCE_API_KEY\s*=\S+|PRIVATE KEY'`

Expected: tests PASS and leak scan returns no matches.

- [ ] **Step 7: Commit**

```powershell
git add apps/freshman-mvp/scripts/verify-roommate-readiness.mts apps/freshman-mvp/deploy/nginx/liveinhdu.cn.conf.example apps/freshman-mvp/docs/ROOMMATE_OPERATIONS.md apps/freshman-mvp/package.json apps/freshman-mvp/test/roommate-readiness-script.test.ts
git commit -m "docs: add roommate deployment gate"
```

---

### Task 10: Full Regression, Migration Safety, and Release Checkpoint

**Files:**
- Create: `apps/freshman-mvp/test/roommate-e2e.test.ts`
- Create: `docs/checkpoints/2026-08-11-roommate-matching-predeploy.md`
- Modify only if a failing test proves necessary: files introduced by Tasks 1–9.

**Interfaces:**
- Consumes the complete production runtime and built Vue application.
- Produces one auditable predeployment checkpoint; it does not perform live server mutation.

- [ ] **Step 1: Write end-to-end tests against a temporary SQLite database**

The test must start the real production runtime with generated test-only secrets and simulate trusted HTTPS. It must create five same-room registrations, one other-room registration, recover one on a new client, update one, delete one, hide/restore one through loopback admin, advance the clock past 90 days, and assert Q&A counts and review rows are unchanged.

- [ ] **Step 2: Run the E2E test and fix only proven integration gaps**

Run: `npx tsx --test test/roommate-e2e.test.ts`

Expected: PASS with no plaintext nickname, room, contact, management code, or session token present in the SQLite file bytes.

- [ ] **Step 3: Run all server and web tests**

Run: `npm run test:all`

Expected: all Node and Vitest suites PASS. If an external PostgreSQL/WeKnora test is environment-gated, record the exact skip or failure separately and do not describe it as a roommate pass.

- [ ] **Step 4: Build the production application**

Run: `npm run build`

Expected: Vue typecheck, server TypeScript build, Vite production build, and preview-data assertion all exit 0.

- [ ] **Step 5: Verify the staged diff and secret boundary**

Run:

```powershell
git diff --check
git status --short
$base = git merge-base HEAD origin/codex/member3-real-api-integration-20260808
git diff --name-only "$base..HEAD"
```

Confirm `.env.local`, runtime databases, backups, private guide content, and generated secrets are absent from commits. Confirm the pre-existing unrelated dirty files were never staged.

- [ ] **Step 6: Record the predeployment checkpoint**

The checkpoint must record exact commit SHA, test counts, build result, feature flag default, migration version, database backup requirement, HTTPS/ICP blocker, and the statement “not deployed” until server verification actually occurs.

- [ ] **Step 7: Commit**

```powershell
git add apps/freshman-mvp/test/roommate-e2e.test.ts docs/checkpoints/2026-08-11-roommate-matching-predeploy.md
git commit -m "test: verify roommate matching release"
```

---

## Live Deployment Gate (Performed Only After Code Review and Domain Readiness)

The implementation session stops at a verified predeployment commit. Live changes require a separate, explicit deployment step with the following order:

1. Read-only verify the current server service, client, admin 403 boundary, database path, Q&A count, review count, and deployed source SHA.
2. Create and integrity-check a timestamped SQLite backup; record the absolute path and SHA-256.
3. Upload/build the reviewed code with `ROOMMATE_MATCHING_ENABLED=false`.
4. Restart `live-in-hdu`; verify Q&A and admin behavior before touching Nginx.
5. Complete domain ownership, ICP, DNS, certificate, Nginx 80/443, and bind Node to `127.0.0.1:3210`.
6. Run `npm run verify:roommates -- --base-url https://liveinhdu.cn` while the feature remains disabled; verify the expected disabled result and secure transport.
7. Add server-only roommate secrets with file mode 600, enable the feature, and restart.
8. Run the readiness probe again, then complete one disposable phone registration/recovery/delete acceptance flow.
9. Recheck Q&A count, pending review count, SearXNG loopback-only port 8888, and public denial for admin APIs.
10. If any gate fails, set `ROOMMATE_MATCHING_ENABLED=false` and restore the prior build. Restore the database only when integrity or row-count verification shows migration damage.
