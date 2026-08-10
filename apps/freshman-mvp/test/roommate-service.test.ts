import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import { SqliteRoommateRepository } from '../src/repositories/sqlite-roommate-repository.js';
import { RoommateCrypto } from '../src/roommates/crypto.js';
import {
  ROOMMATE_RATE_POLICIES,
  SlidingWindowRateLimiter,
} from '../src/roommates/rate-limit.js';
import {
  RoommateService,
  type RoommateCreateInput,
  type RoommateRequestContext,
} from '../src/roommates/service.js';
import type { RoommateRepository } from '../src/roommates/models.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function xiashaInput(
  building: string,
  orientation: 'south' | 'north',
  room: string,
  nickname: string,
  contactType: 'wechat' | 'qq' | 'phone' | 'other' | null,
  contactValue: string | null,
): RoommateCreateInput {
  return {
    address: { campus: 'xiasha', building, orientation, room },
    nickname,
    contactType,
    contactValue,
    consent: contactValue !== null,
  };
}

function setup(options: {
  wrapRepository?: (repository: SqliteRoommateRepository) => RoommateRepository;
} = {}) {
  const database = openDatabase(':memory:');
  migrateDatabase(database);
  let nowMs = Date.parse('2026-08-11T00:00:00.000Z');
  let sequence = 0;
  const crypto = new RoommateCrypto({
    encryptionKey: Buffer.alloc(32, 7),
    hmacKey: Buffer.alloc(32, 9),
  });
  const repository = new SqliteRoommateRepository(database);
  const serviceRepository = options.wrapRepository?.(repository) ?? repository;
  const limiter = new SlidingWindowRateLimiter(Buffer.alloc(32, 11), { maxBuckets: 256 });
  const service = new RoommateService(serviceRepository, crypto, {
    limiter,
    now: () => new Date(nowMs),
    id: (prefix) => `${prefix}-${++sequence}`,
  });
  return {
    database,
    repository,
    service,
    setNow: (value: string) => { nowMs = Date.parse(value); },
    advance: (milliseconds: number) => { nowMs += milliseconds; },
  };
}

const ctxA: RoommateRequestContext = { ip: '203.0.113.1' };
const ctxB: RoommateRequestContext = { ip: '203.0.113.2' };
const ctxC: RoommateRequestContext = { ip: '203.0.113.3' };

test('only an active same-room registration can read member contacts', async () => {
  const { database, service } = setup();
  try {
    const first = await service.create(xiashaInput('11', 'south', '207', '小燃', 'wechat', 'wx-a'), ctxA);
    const second = await service.create(xiashaInput('11', 'south', '207', '小点', null, null), ctxB);
    await service.create(xiashaInput('11', 'north', '207', '隔壁', 'qq', '12345'), ctxC);
    const members = await service.listMembers(first.sessionToken, ctxA);
    assert.deepEqual(members.map((item) => item.nickname), ['小燃', '小点']);
    assert.equal(members[0]?.contact?.value, 'wx-a');
    await assert.rejects(() => service.listMembers('invalid', ctxA), /session/i);
    assert.equal(second.managementCode.length > 30, true);
  } finally {
    database.close();
  }
});

test('member listing revalidates the current room atomically across a room-change interleave', async () => {
  let armed = false;
  let interleaved = false;
  let movingRegistrationId = '';
  const { database, repository, service } = setup({
    wrapRepository: (target) => new Proxy(target, {
      get(current, property) {
        if (property === 'getRegistrationBySessionDigest') {
          return async (sessionDigest: string, now: string) => {
            const stale = await current.getRegistrationBySessionDigest(sessionDigest, now);
            if (armed && !interleaved && stale?.id === movingRegistrationId) {
              interleaved = true;
              await current.updateRegistration({
                ...stale,
                roomKey: 'interleaved-new-room-key',
                updatedAt: '2026-08-11T00:00:01.000Z',
              });
            }
            return stale;
          };
        }
        if (property === 'listActiveMembersForSession') {
          return async (sessionDigest: string, now: string) => {
            if (armed && !interleaved) {
              interleaved = true;
              const currentRecord = await current.getRegistration(movingRegistrationId);
              assert.ok(currentRecord);
              await current.updateRegistration({
                ...currentRecord,
                roomKey: 'interleaved-new-room-key',
                updatedAt: '2026-08-11T00:00:01.000Z',
              });
            }
            return current.listActiveMembersForSession(sessionDigest, now);
          };
        }
        const value = Reflect.get(current, property, current) as unknown;
        return typeof value === 'function' ? value.bind(current) : value;
      },
    }) as RoommateRepository,
  });
  try {
    const moving = await service.create(xiashaInput('11', 'south', '207', '换房者', null, null), ctxA);
    movingRegistrationId = moving.registrationId;
    await service.create(xiashaInput('11', 'south', '207', '旧室友', 'wechat', 'old-room-secret'), ctxB);
    armed = true;

    const members = await service.listMembers(moving.sessionToken, ctxA);

    assert.equal(interleaved, true);
    assert.deepEqual(members.map((member) => member.nickname), ['换房者']);
    assert.equal(members.some((member) => member.contact?.value === 'old-room-secret'), false);
    assert.equal((await repository.getRegistration(moving.registrationId))?.roomKey, 'interleaved-new-room-key');
  } finally {
    database.close();
  }
});

test('stale hide cannot resurrect a concurrently deleted registration or append its audit', async () => {
  let armed = false;
  let interleaved = false;
  const { database, repository, service } = setup({
    wrapRepository: (target) => new Proxy(target, {
      get(current, property) {
        if (property === 'getRegistration') {
          return async (id: string) => {
            const stale = await current.getRegistration(id);
            if (armed && !interleaved && stale) {
              interleaved = true;
              const deletedAt = '2026-08-11T00:00:01.000Z';
              await current.moderate({
                ...stale,
                contactType: null,
                contactCiphertext: null,
                contactDigest: null,
                consentAt: null,
                status: 'deleted',
                updatedAt: deletedAt,
                deletedAt,
              }, { status: stale.status, updatedAt: stale.updatedAt }, {
                id: 'interleaved-delete-audit',
                registrationId: stale.id,
                actorId: 'local-admin',
                action: 'delete',
                reason: 'concurrent delete',
                createdAt: deletedAt,
              });
            }
            return stale;
          };
        }
        const value = Reflect.get(current, property, current) as unknown;
        return typeof value === 'function' ? value.bind(current) : value;
      },
    }) as RoommateRepository,
  });
  try {
    const created = await service.create(xiashaInput('11', 'south', '207', '并发审核', 'wechat', 'never-restore'), ctxA);
    armed = true;

    await assert.rejects(
      () => service.moderate(created.registrationId, {
        action: 'hide', actorId: 'local-admin', reason: 'stale hide',
      }),
      /concurrent|registration/i,
    );

    assert.equal(interleaved, true);
    const persisted = await repository.getRegistration(created.registrationId);
    assert.equal(persisted?.status, 'deleted');
    assert.equal(persisted?.contactCiphertext, null);
    assert.deepEqual(
      database.prepare('SELECT action, reason FROM roommate_admin_audit ORDER BY rowid').all()
        .map((row) => ({ ...(row as Record<string, unknown>) })),
      [{ action: 'delete', reason: 'concurrent delete' }],
    );
  } finally {
    database.close();
  }
});

test('stale user update cannot resurrect contact after a concurrent delete', async () => {
  let armed = false;
  let interleaved = false;
  const { database, repository, service } = setup({
    wrapRepository: (target) => new Proxy(target, {
      get(current, property) {
        if (property === 'getRegistrationBySessionDigest') {
          return async (sessionDigest: string, now: string) => {
            const stale = await current.getRegistrationBySessionDigest(sessionDigest, now);
            if (armed && !interleaved && stale) {
              interleaved = true;
              const deletedAt = '2026-08-11T00:00:01.000Z';
              await current.moderate({
                ...stale,
                contactType: null,
                contactCiphertext: null,
                contactDigest: null,
                consentAt: null,
                status: 'deleted',
                updatedAt: deletedAt,
                deletedAt,
              }, { status: stale.status, updatedAt: stale.updatedAt });
            }
            return stale;
          };
        }
        const value = Reflect.get(current, property, current) as unknown;
        return typeof value === 'function' ? value.bind(current) : value;
      },
    }) as RoommateRepository,
  });
  try {
    const created = await service.create(xiashaInput('11', 'south', '207', '并发更新', 'wechat', 'erase-me'), ctxA);
    armed = true;

    await assert.rejects(
      () => service.updateMine(
        created.sessionToken,
        xiashaInput('11', 'north', '301', '陈旧更新', 'wechat', 'resurrected'),
        ctxA,
      ),
      /concurrent|session/i,
    );

    assert.equal(interleaved, true);
    const persisted = await repository.getRegistration(created.registrationId);
    assert.equal(persisted?.status, 'deleted');
    assert.equal(persisted?.contactType, null);
    assert.equal(persisted?.contactCiphertext, null);
    assert.equal(persisted?.contactDigest, null);
    assert.equal(persisted?.consentAt, null);
    assert.equal(
      database.prepare('SELECT COUNT(*) AS count FROM roommate_sessions WHERE registration_id = ?')
        .get(created.registrationId)?.count,
      0,
    );
  } finally {
    database.close();
  }
});

test('service mutations advance the optimistic version even when the clock is frozen', async () => {
  const { database, service } = setup();
  try {
    const created = await service.create(xiashaInput('11', 'south', '207', '版本一', null, null), ctxA);
    const updated = await service.updateMine(
      created.sessionToken,
      xiashaInput('11', 'south', '207', '版本二', null, null),
      ctxA,
    );
    const hidden = await service.moderate(created.registrationId, {
      action: 'hide', actorId: 'local-admin', reason: 'version check',
    });

    assert.equal(updated.updatedAt > created.own.updatedAt, true);
    assert.equal(hidden.updatedAt > updated.updatedAt, true);
  } finally {
    database.close();
  }
});

test('requires consent for contact and accepts a registration without contact', async () => {
  const { database, service } = setup();
  try {
    await assert.rejects(
      () => service.create({ ...xiashaInput('11', 'south', '207', '小燃', 'wechat', 'wx-a'), consent: false }, ctxA),
      /consent/i,
    );
    const created = await service.create(xiashaInput('11', 'south', '207', '小点', null, null), ctxB);
    assert.equal(created.own.contact, null);
  } finally {
    database.close();
  }
});

test('valid same-session create returns the existing active registration', async () => {
  const { database, service } = setup();
  try {
    const first = await service.create(xiashaInput('11', 'south', '207', '小燃', null, null), ctxA);
    const again = await service.create(
      xiashaInput('12', 'north', '301', '不应覆盖', null, null),
      { ...ctxA, sessionToken: first.sessionToken },
    );
    assert.equal(again.registrationId, first.registrationId);
    assert.equal(again.sessionToken, first.sessionToken);
    assert.equal(again.managementCode, null);
    assert.equal(again.own.nickname, '小燃');
    assert.equal(again.own.address.room, '207');
  } finally {
    database.close();
  }
});

test('rejects duplicate active contact and permits reuse after deletion', async () => {
  const { database, service } = setup();
  try {
    const first = await service.create(xiashaInput('11', 'south', '207', '小燃', 'wechat', ' WX-A '), ctxA);
    await assert.rejects(
      () => service.create(xiashaInput('12', 'south', '301', '重复', 'wechat', 'wx-a'), ctxB),
      /contact.*active|active.*contact/i,
    );
    await service.deleteMine(first.sessionToken, ctxA);
    const reused = await service.create(xiashaInput('12', 'south', '301', '可复用', 'wechat', 'wx-a'), ctxB);
    assert.equal(reused.own.contact?.value, 'wx-a');
  } finally {
    database.close();
  }
});

test('room change revokes access to the old room while preserving identity and creation time', async () => {
  const { database, service } = setup();
  try {
    const owner = await service.create(xiashaInput('11', 'south', '207', '搬家者', null, null), ctxA);
    const oldRoom = await service.create(xiashaInput('11', 'south', '207', '老室友', 'qq', '111'), ctxB);
    const before = await service.getMine(owner.sessionToken, ctxA);
    const updated = await service.updateMine(
      owner.sessionToken,
      xiashaInput('11', 'north', '207', '搬家者', null, null),
      ctxA,
    );
    assert.equal(updated.id, owner.registrationId);
    assert.equal(updated.createdAt, before.createdAt);
    assert.deepEqual((await service.listMembers(owner.sessionToken, ctxA)).map((item) => item.nickname), ['搬家者']);
    assert.deepEqual((await service.listMembers(oldRoom.sessionToken, ctxB)).map((item) => item.nickname), ['老室友']);
  } finally {
    database.close();
  }
});

test('hidden, deleted, expired, and session-expired registrations cannot list members', async () => {
  const { database, repository, service, advance, setNow } = setup();
  try {
    const hidden = await service.create(xiashaInput('11', 'south', '201', '隐藏', null, null), ctxA);
    await service.moderate(hidden.registrationId, { action: 'hide', actorId: 'local-admin', reason: 'privacy request' });
    await assert.rejects(() => service.listMembers(hidden.sessionToken, ctxA), /session/i);

    const deleted = await service.create(xiashaInput('11', 'south', '202', '删除', 'qq', '222'), ctxB);
    await service.deleteMine(deleted.sessionToken, ctxB);
    await assert.rejects(() => service.listMembers(deleted.sessionToken, ctxB), /session/i);

    const expired = await service.create(xiashaInput('11', 'south', '203', '过期', 'qq', '333'), ctxC);
    advance(90 * DAY_MS);
    await service.runRetention();
    await assert.rejects(() => service.listMembers(expired.sessionToken, ctxC), /session/i);
    const expiredRecord = await repository.getRegistration(expired.registrationId);
    assert.equal(expiredRecord?.status, 'expired');
    assert.equal(expiredRecord?.contactCiphertext, null);

    setNow('2026-08-11T00:00:00.000Z');
    const sessionExpired = await service.create(xiashaInput('11', 'south', '204', '会话过期', null, null), { ip: '203.0.113.4' });
    database.prepare('UPDATE roommate_sessions SET expires_at = ? WHERE registration_id = ?')
      .run('2026-08-10T23:59:59.999Z', sessionExpired.registrationId);
    await assert.rejects(() => service.listMembers(sessionExpired.sessionToken, { ip: '203.0.113.4' }), /session/i);
  } finally {
    database.close();
  }
});

test('recovery succeeds and missing ID and wrong management code share one public error', async () => {
  const { database, service } = setup();
  try {
    const created = await service.create(xiashaInput('11', 'south', '207', '找回', null, null), ctxA);
    const recovered = await service.recover(created.registrationId, created.managementCode!, ctxB);
    assert.equal(recovered.registrationId, created.registrationId);
    assert.notEqual(recovered.sessionToken, created.sessionToken);
    assert.equal((await service.getMine(recovered.sessionToken, ctxB)).nickname, '找回');

    let missingMessage = '';
    let wrongMessage = '';
    try {
      await service.recover('missing', 'wrong-code', ctxC);
    } catch (error) {
      missingMessage = (error as Error).message;
    }
    try {
      await service.recover(created.registrationId, 'wrong-code', { ip: '203.0.113.4' });
    } catch (error) {
      wrongMessage = (error as Error).message;
    }
    assert.notEqual(missingMessage, '');
    assert.equal(missingMessage, wrongMessage);
  } finally {
    database.close();
  }
});

test('does not impose a fixed room member cap', async () => {
  const { database, service } = setup();
  try {
    const registrations = [];
    for (let index = 0; index < 35; index += 1) {
      registrations.push(await service.create(
        xiashaInput('11', 'south', '207', `室友${index}`, null, null),
        { ip: `198.51.100.${index + 1}` },
      ));
    }
    assert.equal((await service.listMembers(registrations[0]!.sessionToken, ctxA)).length, 35);
  } finally {
    database.close();
  }
});

test('validates nickname code-point length, controls, and contact pairs', async () => {
  const { database, service } = setup();
  try {
    const invalid = [
      { input: xiashaInput('11', 'south', '207', '', null, null), pattern: /nickname/i },
      { input: xiashaInput('11', 'south', '207', '好'.repeat(31), null, null), pattern: /nickname/i },
      { input: xiashaInput('11', 'south', '207', '好\u0000', null, null), pattern: /nickname/i },
      { input: xiashaInput('11', 'south', '207', '好\u0085', null, null), pattern: /nickname/i },
      { input: { ...xiashaInput('11', 'south', '207', '😀'.repeat(30), null, null) }, pattern: null },
      { input: { ...xiashaInput('11', 'south', '207', '小燃', null, null), contactValue: 'wx' }, pattern: /contact/i },
      { input: { ...xiashaInput('11', 'south', '207', '小燃', 'wechat', 'wx'), contactValue: null }, pattern: /contact/i },
    ];
    for (const [index, item] of invalid.entries()) {
      const context = { ip: `192.0.2.${index + 1}` };
      if (item.pattern === null) {
        assert.equal((await service.create(item.input, context)).own.nickname, '😀'.repeat(30));
      } else {
        await assert.rejects(() => service.create(item.input, context), item.pattern);
      }
    }
  } finally {
    database.close();
  }
});

test('persists 90-day registration and session expiry', async () => {
  const { database, service } = setup();
  try {
    const created = await service.create(xiashaInput('11', 'south', '207', '九十天', null, null), ctxA);
    assert.equal(created.own.expiresAt, '2026-11-09T00:00:00.000Z');
    const session = database.prepare('SELECT expires_at FROM roommate_sessions WHERE registration_id = ?')
      .get(created.registrationId) as { expires_at: string };
    assert.equal(session.expires_at, '2026-11-09T00:00:00.000Z');
  } finally {
    database.close();
  }
});

test('registration and initial session creation roll back together and retry succeeds', async () => {
  const { database, service } = setup();
  try {
    database.exec(`
      CREATE TRIGGER fail_initial_roommate_session
      BEFORE INSERT ON roommate_sessions
      BEGIN
        SELECT RAISE(ABORT, 'injected session failure');
      END;
    `);
    await assert.rejects(
      () => service.create(xiashaInput('11', 'south', '207', '原子创建', 'wechat', 'atomic-create'), ctxA),
      /injected session failure/i,
    );
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM roommate_registrations').get() as { count: number }).count,
      0,
    );

    database.exec('DROP TRIGGER fail_initial_roommate_session');
    const retry = await service.create(
      xiashaInput('11', 'south', '207', '原子创建', 'wechat', 'atomic-create'),
      ctxA,
    );
    assert.equal(retry.own.contact?.value, 'atomic-create');
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM roommate_registrations').get() as { count: number }).count,
      1,
    );
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM roommate_sessions').get() as { count: number }).count,
      1,
    );
  } finally {
    database.close();
  }
});

test('admin lists masked records and audits contact reveal plus atomic moderation', async () => {
  const { database, service } = setup();
  try {
    const created = await service.create(xiashaInput('11', 'south', '207', '审核', 'wechat', 'private-wx'), ctxA);
    await assert.rejects(() => service.listAdmin('someone-else', 'review'), /admin/i);
    await assert.rejects(() => service.listAdmin('local-admin', '   '), /reason/i);
    const listed = await service.listAdmin('local-admin', 'daily review');
    assert.equal(listed[0]?.contact?.value, undefined);
    assert.equal(listed[0]?.contact?.masked, true);

    await assert.rejects(() => service.revealAdminContact(created.registrationId, 'local-admin', ''), /reason/i);
    assert.deepEqual(
      await service.revealAdminContact(created.registrationId, 'local-admin', 'investigate report'),
      { type: 'wechat', value: 'private-wx' },
    );
    await service.moderate(created.registrationId, {
      action: 'hide', actorId: 'local-admin', reason: 'privacy report',
    });
    await service.moderate(created.registrationId, {
      action: 'restore', actorId: 'local-admin', reason: 'appeal accepted',
    });
    await service.moderate(created.registrationId, {
      action: 'delete', actorId: 'local-admin', reason: 'owner request',
    });
    const deleted = (await service.listAdmin('local-admin', 'verify deletion', 'deleted'))[0];
    assert.equal(deleted?.contact, null);
    assert.equal(deleted?.status, 'deleted');
    assert.equal(deleted?.deletedAt, '2026-08-11T00:00:00.000Z');

    const audits = (database.prepare(
      'SELECT action, actor_id, reason FROM roommate_admin_audit ORDER BY rowid',
    ).all() as Array<{ action: string; actor_id: string; reason: string }>).map((row) => ({ ...row }));
    assert.deepEqual(audits, [
      { action: 'view_contact', actor_id: 'local-admin', reason: 'investigate report' },
      { action: 'hide', actor_id: 'local-admin', reason: 'privacy report' },
      { action: 'restore', actor_id: 'local-admin', reason: 'appeal accepted' },
      { action: 'delete', actor_id: 'local-admin', reason: 'owner request' },
    ]);
  } finally {
    database.close();
  }
});

test('masked admin listing never decrypts contact ciphertext', async () => {
  const { database, service } = setup();
  try {
    const created = await service.create(xiashaInput('11', 'south', '207', '遮罩', 'wechat', 'private-wx'), ctxA);
    database.prepare('UPDATE roommate_registrations SET contact_ciphertext = ? WHERE id = ?')
      .run('intentionally-not-valid-ciphertext', created.registrationId);
    const listed = await service.listAdmin('local-admin', 'masked review');
    assert.deepEqual(listed[0]?.contact, { type: 'wechat', masked: true });
  } finally {
    database.close();
  }
});

test('restore only accepts hidden unexpired records and delete revokes sessions', async () => {
  const { database, service, advance } = setup();
  try {
    const active = await service.create(xiashaInput('11', 'south', '207', '活动', null, null), ctxA);
    await assert.rejects(
      () => service.moderate(active.registrationId, { action: 'restore', actorId: 'local-admin', reason: 'invalid state' }),
      /hidden/i,
    );
    await service.moderate(active.registrationId, { action: 'hide', actorId: 'local-admin', reason: 'review' });
    advance(90 * DAY_MS);
    await assert.rejects(
      () => service.moderate(active.registrationId, { action: 'restore', actorId: 'local-admin', reason: 'too late' }),
      /expired/i,
    );
  } finally {
    database.close();
  }
});

test('moderation rejects an unknown runtime action without changing state or audit', async () => {
  const { database, repository, service } = setup();
  try {
    const created = await service.create(xiashaInput('11', 'south', '207', '未知动作', 'wechat', 'keep-me'), ctxA);
    await assert.rejects(
      () => service.moderate(created.registrationId, {
        action: 'ban' as never,
        actorId: 'local-admin',
        reason: 'invalid action test',
      }),
      /action/i,
    );
    const persisted = await repository.getRegistration(created.registrationId);
    assert.equal(persisted?.status, 'active');
    assert.notEqual(persisted?.contactCiphertext, null);
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM roommate_admin_audit').get() as { count: number }).count,
      0,
    );
  } finally {
    database.close();
  }
});

test('bounded sliding-window policies enforce limits without storing raw IPs', () => {
  assert.deepEqual(ROOMMATE_RATE_POLICIES, {
    create: { limit: 5, windowMs: 60 * 60 * 1000 },
    recover: { limit: 10, windowMs: 15 * 60 * 1000 },
    members: { limit: 120, windowMs: 60 * 1000 },
  });
  const limiter = new SlidingWindowRateLimiter(Buffer.alloc(32, 4), { maxBuckets: 2 });
  for (let index = 0; index < 5; index += 1) {
    limiter.consume('create', '203.0.113.99', index);
  }
  assert.throws(() => limiter.consume('create', '203.0.113.99', 5), /rate/i);
  limiter.consume('create', '198.51.100.1', 6);
  assert.throws(() => limiter.consume('create', '198.51.100.2', 7), /rate/i);
  assert.throws(() => limiter.consume('create', '203.0.113.99', 8), /rate/i);
  assert.equal(limiter.size, 2);
  assert.equal(JSON.stringify(limiter).includes('203.0.113.99'), false);
});

test('limiter prunes members and recover buckets on their own policy windows', () => {
  const limiter = new SlidingWindowRateLimiter(Buffer.alloc(32, 5), { maxBuckets: 2 });
  limiter.consume('create', '203.0.113.1', 0);
  limiter.consume('members', '203.0.113.2', 0);

  const afterMembersExpiry = ROOMMATE_RATE_POLICIES.members.windowMs + 1;
  limiter.consume('recover', '203.0.113.3', afterMembersExpiry);
  assert.equal(limiter.size, 2);

  const afterRecoverExpiry = afterMembersExpiry + ROOMMATE_RATE_POLICIES.recover.windowMs + 1;
  limiter.consume('members', '203.0.113.4', afterRecoverExpiry);
  assert.equal(limiter.size, 2);
});

test('service enforces create, recovery, and member-list rate policies', async () => {
  const createCase = setup();
  try {
    for (let index = 0; index < 5; index += 1) {
      await createCase.service.create(
        xiashaInput('11', 'south', `${200 + index}`, `创建${index}`, null, null),
        { ip: '192.0.2.100' },
      );
    }
    await assert.rejects(
      () => createCase.service.create(xiashaInput('11', 'south', '299', '超限', null, null), { ip: '192.0.2.100' }),
      /rate/i,
    );
  } finally {
    createCase.database.close();
  }

  const recoveryCase = setup();
  try {
    const created = await recoveryCase.service.create(xiashaInput('11', 'south', '207', '找回限流', null, null), ctxA);
    for (let index = 0; index < 10; index += 1) {
      await assert.rejects(
        () => recoveryCase.service.recover('missing', 'wrong', { ip: '192.0.2.101' }),
        /registration/i,
      );
    }
    await assert.rejects(
      () => recoveryCase.service.recover(created.registrationId, created.managementCode!, { ip: '192.0.2.101' }),
      /rate/i,
    );
  } finally {
    recoveryCase.database.close();
  }

  const membersCase = setup();
  try {
    const created = await membersCase.service.create(xiashaInput('11', 'south', '207', '列表限流', null, null), ctxA);
    for (let index = 0; index < 120; index += 1) {
      await membersCase.service.listMembers(created.sessionToken, { ip: '192.0.2.102' });
    }
    await assert.rejects(
      () => membersCase.service.listMembers(created.sessionToken, { ip: '192.0.2.102' }),
      /rate/i,
    );
  } finally {
    membersCase.database.close();
  }
});
