import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import { SqliteRoommateRepository } from '../src/repositories/sqlite-roommate-repository.js';
import type {
  RoommateAdminAuditRecord,
  RoommateRegistrationRecord,
  RoommateSessionRecord,
} from '../src/roommates/models.js';

const createdAt = '2026-08-11T00:00:00.000Z';
const expiresAt = '2026-11-09T00:00:00.000Z';

function registration(overrides: Partial<RoommateRegistrationRecord> = {}): RoommateRegistrationRecord {
  const id = overrides.id ?? 'registration-1';
  const contactType = overrides.contactType === undefined ? 'wechat' : overrides.contactType;
  const contactCiphertext = overrides.contactCiphertext === undefined
    ? 'encrypted-contact'
    : overrides.contactCiphertext;
  const contactDigest = overrides.contactDigest === undefined ? 'contact-digest' : overrides.contactDigest;
  return {
    id,
    campusCode: 'xiasha',
    templateVersion: 'xiasha-v1',
    roomKey: 'room-key-11-south-207',
    bedKey: null,
    buildingKey: 'building-key-11',
    addressCiphertext: 'encrypted-address',
    nicknameCiphertext: 'encrypted-nickname',
    contactType,
    contactCiphertext,
    contactDigest,
    contacts: contactType && contactCiphertext && contactDigest ? [{
      registrationId: id,
      type: contactType,
      ciphertext: contactCiphertext,
      digest: contactDigest,
      createdAt,
      updatedAt: createdAt,
    }] : [],
    managementDigest: 'management-digest',
    consentAt: createdAt,
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    deletedAt: null,
    ...overrides,
  };
}

function session(overrides: Partial<RoommateSessionRecord> = {}): RoommateSessionRecord {
  return {
    sessionDigest: 'session-digest-1',
    registrationId: 'registration-1',
    createdAt,
    expiresAt,
    ...overrides,
  };
}

function audit(overrides: Partial<RoommateAdminAuditRecord> = {}): RoommateAdminAuditRecord {
  return {
    id: 'audit-1',
    registrationId: 'registration-1',
    actorId: 'local-admin',
    action: 'hide',
    reason: 'duplicate submission',
    createdAt,
    ...overrides,
  };
}

function seedQuestionIntent(database: ReturnType<typeof openDatabase>): void {
  database.prepare(`
    INSERT INTO question_intents (
      id, external_id, category, question, intent_description, aliases_json,
      keywords_json, exclude_keywords_json, active, featured, display_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'qa-intent-1', 'Q01', '校园生活', '问答数据是否还在？', '验证增量迁移不触碰既有问答数据。',
    '[]', '[]', '[]', 1, 0, 1, createdAt, createdAt,
  );
}

test('migration adds roommate tables without changing existing pre-v5 Q&A rows', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-roommate-upgrade-'));
  const databasePath = path.join(directory, 'upgrade.db');
  const db = openDatabase(databasePath);
  try {
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE question_intents (
        id TEXT PRIMARY KEY,
        external_id TEXT,
        category TEXT NOT NULL,
        question TEXT NOT NULL,
        intent_description TEXT NOT NULL,
        aliases_json TEXT NOT NULL,
        keywords_json TEXT NOT NULL,
        exclude_keywords_json TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        featured INTEGER NOT NULL CHECK (featured IN (0, 1)),
        display_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE roommate_registrations (
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
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `);
    for (const version of [1, 2, 3]) {
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, createdAt);
    }
    seedQuestionIntent(db);
    const legacy = registration({
      contactType: 'other',
      contacts: [{
        registrationId: 'registration-1',
        type: 'other',
        ciphertext: 'encrypted-contact',
        digest: 'contact-digest',
        createdAt,
        updatedAt: createdAt,
      }],
    });
    db.prepare(`
      INSERT INTO roommate_registrations (
        id, campus_code, template_version, room_key, building_key, address_ciphertext,
        nickname_ciphertext, contact_type, contact_ciphertext, contact_digest,
        management_digest, consent_at, status, created_at, updated_at, expires_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      legacy.id, legacy.campusCode, legacy.templateVersion, legacy.roomKey, legacy.buildingKey,
      legacy.addressCiphertext, legacy.nicknameCiphertext, legacy.contactType,
      legacy.contactCiphertext, legacy.contactDigest, legacy.managementDigest, legacy.consentAt,
      legacy.status, legacy.createdAt, legacy.updatedAt, legacy.expiresAt, legacy.deletedAt,
    );
    const before = {
      ...(db.prepare('SELECT * FROM question_intents WHERE id = ?').get('qa-intent-1') as Record<string, unknown>),
    };
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    await repository.createSession(session());

    const names = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all().map((row) => String((row as { name: string }).name));
    assert.ok(names.includes('roommate_registrations'));
    assert.ok(names.includes('roommate_sessions'));
    assert.ok(names.includes('roommate_admin_audit'));
    assert.ok(names.includes('question_intents'));
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS count FROM question_intents').get() as { count: number }).count),
      1,
    );
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 4').get() as { count: number }).count),
      1,
    );
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 5').get() as { count: number }).count),
      1,
    );
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 7').get() as { count: number }).count),
      1,
    );
    assert.deepEqual(
      { ...(db.prepare(`
        SELECT contact_type, contact_ciphertext, contact_digest, active_digest
        FROM roommate_registration_contacts WHERE registration_id = ?
      `).get('registration-1') as Record<string, unknown>) },
      {
        contact_type: 'other',
        contact_ciphertext: 'encrypted-contact',
        contact_digest: 'contact-digest',
        active_digest: 'contact-digest',
      },
    );
    assert.equal(
      (db.prepare('SELECT bed_key FROM roommate_registrations WHERE id = ?').get('registration-1') as { bed_key: string | null }).bed_key,
      null,
    );
    assert.equal(
      Number((db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'roommate_registrations_active_bed'").get() as { count: number }).count),
      1,
    );
    assert.deepEqual(
      { ...(db.prepare('SELECT * FROM question_intents WHERE id = ?').get('qa-intent-1') as Record<string, unknown>) },
      before,
    );
    db.close();

    const reopened = openDatabase(databasePath);
    migrateDatabase(reopened);
    assert.deepEqual(
      { ...(reopened.prepare('SELECT * FROM question_intents WHERE id = ?').get('qa-intent-1') as Record<string, unknown>) },
      before,
    );
    assert.deepEqual(
      await new SqliteRoommateRepository(reopened).getRegistration('registration-1'),
      legacy,
    );
    reopened.close();
  } finally {
    if (db.isOpen) {
      db.close();
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('repository preserves Q&A and roommate records across a database reopen', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'live-in-hdu-roommate-'));
  const databasePath = path.join(directory, 'roommates.db');
  try {
    const first = openDatabase(databasePath);
    migrateDatabase(first);
    seedQuestionIntent(first);
    const repository = new SqliteRoommateRepository(first);
    await repository.createRegistration(registration());
    await repository.createSession(session());
    first.close();

    const reopened = openDatabase(databasePath);
    migrateDatabase(reopened);
    const persisted = new SqliteRoommateRepository(reopened);
    assert.deepEqual(await persisted.getRegistration('registration-1'), registration());
    assert.deepEqual(await persisted.getRegistrationBySessionDigest('session-digest-1', createdAt), registration());
    assert.equal(
      Number((reopened.prepare('SELECT COUNT(*) AS count FROM question_intents').get() as { count: number }).count),
      1,
    );
    reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('repository rejects expired sessions and finds only active duplicate contacts', async () => {
  const db = openDatabase(':memory:');
  try {
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    const active = registration();
    const deleted = registration({
      id: 'registration-deleted',
      managementDigest: 'management-deleted',
      contactDigest: 'deleted-contact-digest',
      status: 'deleted',
    });
    await repository.createRegistration(active);
    await repository.createRegistration(deleted);
    await repository.createSession(session({ expiresAt: '2026-08-10T23:59:59.999Z' }));

    assert.equal(await repository.getRegistrationBySessionDigest('session-digest-1', createdAt), null);
    assert.deepEqual(await repository.getActiveRegistrationByContactDigest('contact-digest'), active);
    assert.equal(await repository.getActiveRegistrationByContactDigest('deleted-contact-digest'), null);
  } finally {
    db.close();
  }
});

test('repository scopes active members and atomically expires personal contact and sessions', async () => {
  const db = openDatabase(':memory:');
  try {
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    const due = registration({ expiresAt: '2026-08-10T23:59:59.999Z' });
    const hidden = registration({
      id: 'registration-hidden', managementDigest: 'management-hidden', contactDigest: 'contact-hidden',
      status: 'hidden', expiresAt: due.expiresAt,
    });
    const future = registration({
      id: 'registration-future', managementDigest: 'management-future', contactDigest: 'contact-future',
    });
    const otherRoom = registration({
      id: 'registration-other', managementDigest: 'management-other', contactDigest: 'contact-other',
      roomKey: 'room-key-11-north-207',
    });
    await repository.createRegistration(due);
    await repository.createRegistration(hidden);
    await repository.createRegistration(future);
    await repository.createRegistration(otherRoom);
    await repository.createSession(session());
    await repository.createSession(session({ sessionDigest: 'session-hidden', registrationId: hidden.id }));

    assert.deepEqual(
      (await repository.listActiveMembers(due.roomKey, createdAt)).map((item) => item.id),
      ['registration-future'],
    );
    await repository.expireDue(createdAt);

    assert.deepEqual(await repository.listActiveMembers(due.roomKey, createdAt), [future]);
    assert.deepEqual(await repository.getRegistrationBySessionDigest('session-digest-1', createdAt), null);
    assert.deepEqual(await repository.getRegistrationBySessionDigest('session-hidden', createdAt), null);
    assert.deepEqual(await repository.getRegistration('registration-1'), registration({
      expiresAt: due.expiresAt,
      status: 'expired', contactType: null, contactCiphertext: null, contactDigest: null,
      consentAt: null, updatedAt: createdAt,
    }));
    assert.deepEqual(await repository.getRegistration(hidden.id), {
      ...hidden,
      status: 'expired',
      contactType: null,
      contactCiphertext: null,
      contactDigest: null,
      contacts: [],
      consentAt: null,
      updatedAt: createdAt,
    });
  } finally {
    db.close();
  }
});

test('repository updates, moderates, revokes sessions, and records audit entries', async () => {
  const db = openDatabase(':memory:');
  try {
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    await repository.createRegistration(registration());
    await repository.createSession(session());
    const updated = registration({ nicknameCiphertext: 'new-encrypted-nickname', updatedAt: '2026-08-12T00:00:00.000Z' });
    assert.deepEqual(await repository.updateRegistration(updated), updated);
    const hidden = { ...updated, status: 'hidden' as const, updatedAt: '2026-08-12T01:00:00.000Z' };
    assert.deepEqual(
      await repository.moderate(hidden, { status: updated.status, updatedAt: updated.updatedAt }),
      hidden,
    );
    await repository.appendAudit(audit());
    await repository.revokeSessions(updated.id);

    assert.deepEqual(await repository.getRegistrationBySessionDigest(session().sessionDigest, createdAt), null);
    assert.deepEqual(await repository.listAdmin(), [hidden]);
    assert.deepEqual(
      db.prepare('SELECT id, registration_id, actor_id, action, reason, created_at FROM roommate_admin_audit').all()
        .map((row) => ({ ...(row as Record<string, unknown>) })),
      [{ id: 'audit-1', registration_id: 'registration-1', actor_id: 'local-admin', action: 'hide', reason: 'duplicate submission', created_at: createdAt }],
    );
  } finally {
    db.close();
  }
});

test('repository enforces active bed uniqueness while allowing null or distinct beds', async () => {
  const db = openDatabase(':memory:');
  try {
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    await repository.createRegistration(registration({ id: 'bed-1', bedKey: 'bed-key-1' }));
    await assert.rejects(
      () => repository.createRegistration(registration({
        id: 'bed-1-conflict', managementDigest: 'management-bed-1-conflict',
        contactDigest: 'contact-bed-1-conflict', bedKey: 'bed-key-1',
      })),
      (error: unknown) => error instanceof Error && error.message === 'Bed already occupied',
    );
    await repository.createRegistration(registration({
      id: 'bed-2', managementDigest: 'management-bed-2', contactDigest: 'contact-bed-2', bedKey: 'bed-key-2',
    }));
    await repository.createRegistration(registration({
      id: 'other-room-bed-1', managementDigest: 'management-other-room-bed-1', contactDigest: 'contact-other-room-bed-1',
      roomKey: 'room-key-other', bedKey: 'bed-key-1',
    }));
    await repository.createRegistration(registration({
      id: 'null-bed-1', managementDigest: 'management-null-bed-1', contactDigest: 'contact-null-bed-1', bedKey: null,
    }));
    await repository.createRegistration(registration({
      id: 'null-bed-2', managementDigest: 'management-null-bed-2', contactDigest: 'contact-null-bed-2', bedKey: null,
    }));
  } finally {
    db.close();
  }
});

test('repository maps a bed conflict during hidden-to-active restore', async () => {
  const db = openDatabase(':memory:');
  try {
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    const occupant = registration({ id: 'restore-occupant', bedKey: 'bed-key-restore' });
    const hidden = registration({
      id: 'restore-hidden', managementDigest: 'management-restore-hidden', contactDigest: 'contact-restore-hidden',
      bedKey: 'bed-key-hidden', status: 'hidden',
    });
    await repository.createRegistration(occupant);
    await repository.createRegistration(hidden);
    const movedWhileHidden = { ...hidden, bedKey: occupant.bedKey, updatedAt: '2026-08-12T00:00:00.000Z' };
    await repository.updateRegistration(movedWhileHidden);
    const conflicting = { ...movedWhileHidden, status: 'active' as const, updatedAt: '2026-08-12T00:00:01.000Z' };
    await assert.rejects(
      () => repository.moderate(conflicting, { status: movedWhileHidden.status, updatedAt: movedWhileHidden.updatedAt }),
      (error: unknown) => error instanceof Error && error.message === 'Bed already occupied',
    );
  } finally {
    db.close();
  }
});

test('self-update CAS accepts hidden records, preserves hidden status, and rejects stale versions', async () => {
  const db = openDatabase(':memory:');
  try {
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    const active = registration();
    await repository.createRegistration(active);
    const hidden = {
      ...active,
      status: 'hidden' as const,
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    await repository.moderate(hidden, { status: active.status, updatedAt: active.updatedAt });

    const changed = {
      ...hidden,
      roomKey: 'room-key-12-north-301',
      addressCiphertext: 'new-encrypted-address',
      nicknameCiphertext: 'new-encrypted-nickname',
      contactType: 'qq' as const,
      contactCiphertext: 'new-encrypted-contact',
      contactDigest: 'new-contact-digest',
      updatedAt: '2026-08-12T01:00:00.000Z',
    };
    assert.deepEqual(
      await repository.updateSelfRegistration(changed, hidden.updatedAt, hidden.status),
      changed,
    );
    assert.equal((await repository.getRegistration(active.id))?.status, 'hidden');

    const stale = { ...changed, nicknameCiphertext: 'stale-write', updatedAt: '2026-08-12T02:00:00.000Z' };
    assert.equal(
      await repository.updateSelfRegistration(stale, hidden.updatedAt, hidden.status),
      null,
    );
    assert.equal((await repository.getRegistration(active.id))?.nicknameCiphertext, 'new-encrypted-nickname');
  } finally {
    db.close();
  }
});

test('repository returns the latest audit for each requested registration in one bulk result', async () => {
  const db = openDatabase(':memory:');
  try {
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    await repository.createRegistration(registration());
    await repository.createRegistration(registration({
      id: 'registration-2',
      roomKey: 'room-key-11-south-208',
      contactDigest: 'contact-digest-2',
      managementDigest: 'management-digest-2',
    }));
    await repository.appendAudit(audit({
      id: 'audit-old',
      action: 'view_contact',
      reason: 'first review',
      createdAt: '2026-08-11T00:00:00.000Z',
    }));
    await repository.appendAudit(audit({
      id: 'audit-new',
      action: 'hide',
      reason: 'latest review',
      createdAt: '2026-08-11T00:01:00.000Z',
    }));
    await repository.appendAudit(audit({
      id: 'audit-second-registration',
      registrationId: 'registration-2',
      action: 'restore',
      reason: 'appeal accepted',
      createdAt: '2026-08-11T00:02:00.000Z',
    }));

    assert.deepEqual(
      await repository.listLatestAdminAudits(['registration-1', 'registration-2']),
      [
        audit({
          id: 'audit-new',
          action: 'hide',
          reason: 'latest review',
          createdAt: '2026-08-11T00:01:00.000Z',
        }),
        audit({
          id: 'audit-second-registration',
          registrationId: 'registration-2',
          action: 'restore',
          reason: 'appeal accepted',
          createdAt: '2026-08-11T00:02:00.000Z',
        }),
      ],
    );
    assert.deepEqual(await repository.listLatestAdminAudits([]), []);
  } finally {
    db.close();
  }
});

test('repository atomically manages three contacts across hide, restore, delete, and expiry', async () => {
  const db = openDatabase(':memory:');
  try {
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    const first = registration({
      contacts: [
        { registrationId: 'registration-1', type: 'wechat', ciphertext: 'wx-cipher', digest: 'wx-digest', createdAt, updatedAt: createdAt },
        { registrationId: 'registration-1', type: 'qq', ciphertext: 'qq-cipher', digest: 'qq-digest', createdAt, updatedAt: createdAt },
        { registrationId: 'registration-1', type: 'phone', ciphertext: 'phone-cipher', digest: 'phone-digest', createdAt, updatedAt: createdAt },
      ],
    });
    await repository.createRegistration(first);
    assert.deepEqual((await repository.getRegistration(first.id))?.contacts?.map(({ type }) => type), [
      'wechat', 'qq', 'phone',
    ]);

    const hidden = { ...first, status: 'hidden' as const, updatedAt: '2026-08-12T00:00:00.000Z' };
    assert.deepEqual(await repository.moderate(hidden, { status: 'active', updatedAt: createdAt }), hidden);
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS count FROM roommate_registration_contacts WHERE active_digest IS NOT NULL').get() as { count: number }).count),
      0,
    );

    const second = registration({
      id: 'registration-2',
      roomKey: 'room-key-11-south-208',
      contactType: 'qq',
      contactCiphertext: 'qq-cipher',
      contactDigest: 'qq-digest',
      managementDigest: 'management-digest-2',
      contacts: [{ registrationId: 'registration-2', type: 'qq', ciphertext: 'qq-cipher', digest: 'qq-digest', createdAt, updatedAt: createdAt }],
    });
    await repository.createRegistration(second);
    await assert.rejects(
      repository.moderate(
        { ...hidden, status: 'active', updatedAt: '2026-08-12T01:00:00.000Z' },
        { status: 'hidden', updatedAt: hidden.updatedAt },
      ),
      /Contact already has an active registration/,
    );
    assert.equal((await repository.getRegistration(first.id))?.status, 'hidden');

    const deletedSecond = {
      ...second,
      status: 'deleted' as const,
      contactType: null,
      contactCiphertext: null,
      contactDigest: null,
      contacts: [],
      updatedAt: '2026-08-12T02:00:00.000Z',
      deletedAt: '2026-08-12T02:00:00.000Z',
    };
    await repository.moderate(deletedSecond, { status: 'active', updatedAt: createdAt });
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS count FROM roommate_registration_contacts WHERE registration_id = ?').get(second.id) as { count: number }).count),
      0,
    );
    const restored = { ...hidden, status: 'active' as const, updatedAt: '2026-08-12T03:00:00.000Z' };
    assert.deepEqual(await repository.moderate(restored, { status: 'hidden', updatedAt: hidden.updatedAt }), restored);

    await repository.updateRegistration({ ...restored, expiresAt: '2026-08-12T03:30:00.000Z' });
    await repository.expireDue('2026-08-12T04:00:00.000Z');
    assert.equal((await repository.getRegistration(first.id))?.status, 'expired');
    assert.equal(
      Number((db.prepare('SELECT COUNT(*) AS count FROM roommate_registration_contacts WHERE registration_id = ?').get(first.id) as { count: number }).count),
      0,
    );
  } finally {
    db.close();
  }
});
