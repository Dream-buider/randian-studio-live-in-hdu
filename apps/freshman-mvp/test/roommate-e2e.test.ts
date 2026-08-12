import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import { normalizeRoomAddress } from '../src/roommates/address-templates.js';
import { createProductionRuntime } from '../src/server/index.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTTPS_HEADERS = { 'x-forwarded-proto': 'https' };
const COOKIE_NAME = 'live_in_hdu_roommate';
const START = Date.parse('2026-08-11T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function seedExistingData(databasePath: string): void {
  const database = openDatabase(databasePath);
  try {
    migrateDatabase(database);
    database.prepare(`
      INSERT INTO question_intents (
        id, external_id, category, question, intent_description, aliases_json,
        keywords_json, exclude_keywords_json, active, featured, display_order,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'e2e-intent', 'Q-E2E', '回归', '既有问答是否保留？', '端到端迁移保护',
      '[]', '[]', '[]', 1, 1, 1, new Date(START).toISOString(), new Date(START).toISOString(),
    );
    database.prepare(`
      INSERT INTO canonical_answers (
        id, intent_id, version, summary, full_answer, sources_json, status,
        reviewer_id, published_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'e2e-answer', 'e2e-intent', 1, '仍然保留。', '室友功能不得改动既有问答。',
      '[]', 'published', 'e2e-reviewer', new Date(START).toISOString(), new Date(START).toISOString(),
    );
    database.prepare(`
      INSERT INTO review_tasks (
        id, question, answer_text, sources_json, risk_level, status, ordinal,
        created_at, provider_status, raw_search_leads_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'e2e-review', '既有待审核问题', '既有待审核答案', '[]', 'medium', 'pending', 1,
      new Date(START).toISOString(), 'available', '[]',
    );
  } finally {
    database.close();
  }
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = String(response.headers['set-cookie'] ?? '').split(';', 1)[0];
  assert.match(value, new RegExp(`^${COOKIE_NAME}=`));
  return value;
}

function sessionSecretFromCookie(cookie: string): string {
  const signed = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  const valueAndSignature = signed.startsWith('s:') ? signed.slice(2) : signed;
  assert.ok(valueAndSignature.lastIndexOf('.') > 0);
  return valueAndSignature.slice(0, valueAndSignature.lastIndexOf('.'));
}

function input(index: number, otherRoom = false) {
  return {
    address: {
      campus: 'xiasha',
      building: otherRoom ? '9372' : '9371',
      orientation: otherRoom ? 'north' : 'south',
      room: otherRoom ? 'ZY92' : 'ZX91',
    },
    nickname: `密文昵称-${index}-QxV`,
    contactType: 'wechat',
    contactValue: `wx-e2e-${index}-QxV-secret`,
    consent: true,
  } as const;
}

const hiddenUpdateInput = {
  address: { campus: 'xiasha', building: '9388', orientation: 'north', room: 'HD88' },
  nickname: '隐藏后更新昵称-QxV',
  contactType: 'qq',
  contactValue: 'hidden-updated-contact-QxV',
  consent: true,
} as const;

function roommatePlaintexts(
  cookies: string[],
  recoveredCookie: string,
  managementCodes: string[],
  secretEnv: { encryption: string; hmac: string; cookie: string },
): string[] {
  const roomAddresses = [input(1).address, input(6, true).address, hiddenUpdateInput.address]
    .map((address) => normalizeRoomAddress(address));
  return [
    ...Array.from({ length: 6 }, (_, index) => input(index + 1, index === 5).nickname),
    ...Array.from({ length: 6 }, (_, index) => input(index + 1, index === 5).contactValue),
    '更新后昵称-QxV',
    hiddenUpdateInput.nickname,
    hiddenUpdateInput.contactValue,
    ...roomAddresses.flatMap((address) => [
      address.canonical,
      address.display,
      JSON.stringify(address),
    ]),
    ...managementCodes,
    ...[...cookies, recoveredCookie].map(sessionSecretFromCookie),
    secretEnv.encryption,
    secretEnv.hmac,
    secretEnv.cookie,
  ];
}

function assertDatabaseContainsNoPlaintext(databasePath: string, forbidden: string[]): void {
  const bytes = Buffer.concat(
    [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file)),
  );
  for (const plaintext of forbidden) {
    assert.equal(
      bytes.includes(Buffer.from(plaintext, 'utf8')),
      false,
      `SQLite leaked plaintext: ${plaintext}`,
    );
  }
}

test('production runtime preserves Q&A while completing the encrypted roommate lifecycle', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-roommate-e2e-'));
  const databasePath = path.join(directory, 'roommate-e2e.db');
  const secretEnv = {
    encryption: randomBytes(32).toString('base64'),
    hmac: randomBytes(32).toString('base64'),
    cookie: randomBytes(48).toString('base64'),
  };
  let nowMs = START;
  let retentionCallback: (() => void) | null = null;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const timer = { unref() {} } as unknown as NodeJS.Timeout;
  seedExistingData(databasePath);

  globalThis.setInterval = ((callback: TimerHandler, delay?: number) => {
    assert.equal(delay, 60 * 60 * 1000);
    retentionCallback = () => void callback();
    return timer;
  }) as typeof setInterval;
  globalThis.clearInterval = (() => undefined) as typeof clearInterval;

  const runtime = await createProductionRuntime({
    appRoot,
    env: {
      DATABASE_PATH: databasePath,
      ROOMMATE_MATCHING_ENABLED: 'true',
      ROOMMATE_PUBLIC_ORIGIN: 'https://liveinhdu.cn',
      ROOMMATE_ENCRYPTION_KEY: secretEnv.encryption,
      ROOMMATE_HMAC_KEY: secretEnv.hmac,
      ROOMMATE_COOKIE_SECRET: secretEnv.cookie,
    },
    runtimePlatform: 'linux',
    now: () => new Date(nowMs),
  });

  const cookies: string[] = [];
  const managementCodes: string[] = [];
  const registrationIds: string[] = [];
  let recoveredCookie = '';
  let forbiddenPlaintexts: string[] = [];
  try {
    const before = {
      questions: runtime.database!.prepare('SELECT * FROM question_intents ORDER BY id').all(),
      answers: runtime.database!.prepare('SELECT * FROM canonical_answers ORDER BY id').all(),
      reviews: runtime.database!.prepare('SELECT * FROM review_tasks ORDER BY id').all(),
    };
    const config = await runtime.app.inject({
      method: 'GET', url: '/api/roommates/config', remoteAddress: '127.0.0.1', headers: HTTPS_HEADERS,
    });
    assert.equal(config.statusCode, 200);
    assert.equal(config.json().enabled, true);

    for (let index = 1; index <= 6; index += 1) {
      const created = await runtime.app.inject({
        method: 'POST',
        url: '/api/roommates/registrations',
        remoteAddress: '127.0.0.1',
        headers: { ...HTTPS_HEADERS, 'x-forwarded-for': `203.0.113.${index}` },
        payload: input(index, index === 6),
      });
      assert.equal(created.statusCode, 200, created.body);
      const body = created.json();
      registrationIds.push(body.registrationId);
      managementCodes.push(body.managementCode);
      cookies.push(cookieFrom(created));
      assert.equal(body.members.length, index === 6 ? 1 : index);
      assert.equal(JSON.stringify(body).includes('sessionToken'), false);
    }

    const recovered = await runtime.app.inject({
      method: 'POST', url: '/api/roommates/recover', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, 'x-forwarded-for': '203.0.113.101' },
      payload: { registrationId: registrationIds[0], managementCode: managementCodes[0] },
    });
    assert.equal(recovered.statusCode, 200, recovered.body);
    recoveredCookie = cookieFrom(recovered);
    assert.notEqual(recoveredCookie, cookies[0]);

    const updatedInput = { ...input(1), nickname: '更新后昵称-QxV' };
    const updated = await runtime.app.inject({
      method: 'PATCH', url: '/api/roommates/me', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, cookie: recoveredCookie }, payload: updatedInput,
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().item.nickname, updatedInput.nickname);

    const moderate = async (action: 'hide' | 'restore') => runtime.app.inject({
      method: 'POST', url: `/api/admin/roommates/${registrationIds[2]}/moderate`,
      remoteAddress: '127.0.0.1', payload: { action, reason: `e2e-${action}` },
    });
    const hidden = await moderate('hide');
    assert.equal(hidden.statusCode, 200, hidden.body);
    assert.equal(hidden.json().item.status, 'hidden');

    const hiddenMine = await runtime.app.inject({
      method: 'GET', url: '/api/roommates/me', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, cookie: cookies[2] },
    });
    assert.equal(hiddenMine.statusCode, 200, hiddenMine.body);
    assert.equal(hiddenMine.json().item.status, 'hidden');
    const hiddenMembers = await runtime.app.inject({
      method: 'GET', url: '/api/roommates/members', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, cookie: cookies[2] },
    });
    assert.ok([401, 404].includes(hiddenMembers.statusCode), hiddenMembers.body);

    const duplicateCreate = await runtime.app.inject({
      method: 'POST', url: '/api/roommates/registrations', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, cookie: cookies[2] }, payload: input(6, true),
    });
    assert.equal(duplicateCreate.statusCode, 200, duplicateCreate.body);
    assert.equal(duplicateCreate.json().registrationId, registrationIds[2]);
    assert.equal(duplicateCreate.json().own.status, 'hidden');
    assert.equal(duplicateCreate.json().managementCode, null);
    assert.deepEqual(duplicateCreate.json().members, []);

    const hiddenUpdated = await runtime.app.inject({
      method: 'PATCH', url: '/api/roommates/me', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, cookie: cookies[2] }, payload: hiddenUpdateInput,
    });
    assert.equal(hiddenUpdated.statusCode, 200, hiddenUpdated.body);
    assert.equal(hiddenUpdated.json().item.status, 'hidden');
    assert.equal(hiddenUpdated.json().item.nickname, hiddenUpdateInput.nickname);
    assert.equal(hiddenUpdated.json().item.address.room, hiddenUpdateInput.address.room);
    assert.equal(hiddenUpdated.json().item.contact.value, hiddenUpdateInput.contactValue);

    const hiddenRecovered = await runtime.app.inject({
      method: 'POST', url: '/api/roommates/recover', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, 'x-forwarded-for': '203.0.113.102' },
      payload: { registrationId: registrationIds[2], managementCode: managementCodes[2] },
    });
    assert.equal(hiddenRecovered.statusCode, 200, hiddenRecovered.body);
    assert.equal(hiddenRecovered.json().own.status, 'hidden');
    const hiddenRecoveredCookie = cookieFrom(hiddenRecovered);
    cookies.push(hiddenRecoveredCookie);
    const recoveredHiddenMembers = await runtime.app.inject({
      method: 'GET', url: '/api/roommates/members', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, cookie: hiddenRecoveredCookie },
    });
    assert.ok([401, 404].includes(recoveredHiddenMembers.statusCode), recoveredHiddenMembers.body);

    const restored = await moderate('restore');
    assert.equal(restored.statusCode, 200, restored.body);
    assert.equal(restored.json().item.status, 'active');
    const restoredMembers = await runtime.app.inject({
      method: 'GET', url: '/api/roommates/members', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, cookie: hiddenRecoveredCookie },
    });
    assert.equal(restoredMembers.statusCode, 200, restoredMembers.body);
    assert.equal(restoredMembers.json().items.length, 1);

    forbiddenPlaintexts = roommatePlaintexts(cookies, recoveredCookie, managementCodes, secretEnv);
    runtime.database!.exec('PRAGMA wal_checkpoint(PASSIVE)');
    assertDatabaseContainsNoPlaintext(databasePath, forbiddenPlaintexts);

    const deleted = await runtime.app.inject({
      method: 'DELETE', url: '/api/roommates/me', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, cookie: cookies[1] },
    });
    assert.equal(deleted.statusCode, 200, deleted.body);

    const members = await runtime.app.inject({
      method: 'GET', url: '/api/roommates/members', remoteAddress: '127.0.0.1',
      headers: { ...HTTPS_HEADERS, cookie: recoveredCookie },
    });
    assert.equal(members.statusCode, 200, members.body);
    assert.equal(members.json().items.length, 3);

    nowMs += 91 * DAY_MS;
    assert.ok(retentionCallback);
    retentionCallback();
    await new Promise<void>((resolve) => setImmediate(resolve));

    const expired = runtime.database!.prepare(
      "SELECT COUNT(*) AS count FROM roommate_registrations WHERE status = 'expired'",
    ).get() as { count: number };
    assert.equal(Number(expired.count), 5);
    assert.equal(
      Number((runtime.database!.prepare('SELECT COUNT(*) AS count FROM roommate_sessions').get() as { count: number }).count),
      0,
    );
    const terminalRows = runtime.database!.prepare(`
      SELECT status, contact_type, contact_ciphertext, contact_digest, consent_at
      FROM roommate_registrations
      WHERE status IN ('expired', 'deleted')
      ORDER BY id
    `).all() as Array<Record<string, unknown>>;
    assert.equal(terminalRows.length, 6);
    assert.equal(terminalRows.filter((row) => row.status === 'expired').length, 5);
    assert.equal(terminalRows.filter((row) => row.status === 'deleted').length, 1);
    for (const row of terminalRows) {
      assert.equal(row.contact_type, null);
      assert.equal(row.contact_ciphertext, null);
      assert.equal(row.contact_digest, null);
      assert.equal(row.consent_at, null);
    }
    for (const cookie of [recoveredCookie, cookies[4]!]) {
      const denied = await runtime.app.inject({
        method: 'GET', url: '/api/roommates/members', remoteAddress: '127.0.0.1',
        headers: { ...HTTPS_HEADERS, cookie },
      });
      assert.ok([401, 404].includes(denied.statusCode), denied.body);
    }
    assert.deepEqual(runtime.database!.prepare('SELECT * FROM question_intents ORDER BY id').all(), before.questions);
    assert.deepEqual(runtime.database!.prepare('SELECT * FROM canonical_answers ORDER BY id').all(), before.answers);
    assert.deepEqual(runtime.database!.prepare('SELECT * FROM review_tasks ORDER BY id').all(), before.reviews);
  } finally {
    await runtime.close();
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }

  try {
    assertDatabaseContainsNoPlaintext(databasePath, forbiddenPlaintexts);
    assert.equal((await readFile(databasePath)).length > 0, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
