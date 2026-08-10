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
  return {
    id: 'registration-1',
    campusCode: 'xiasha',
    templateVersion: 'xiasha-v1',
    roomKey: 'room-key-11-south-207',
    buildingKey: 'building-key-11',
    addressCiphertext: 'encrypted-address',
    nicknameCiphertext: 'encrypted-nickname',
    contactType: 'wechat',
    contactCiphertext: 'encrypted-contact',
    contactDigest: 'contact-digest',
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

test('migration adds roommate tables without changing existing pre-v4 Q&A rows', async () => {
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
    `);
    for (const version of [1, 2, 3]) {
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, createdAt);
    }
    seedQuestionIntent(db);
    const before = {
      ...(db.prepare('SELECT * FROM question_intents WHERE id = ?').get('qa-intent-1') as Record<string, unknown>),
    };
    migrateDatabase(db);
    const repository = new SqliteRoommateRepository(db);
    await repository.createRegistration(registration());
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
      registration(),
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
      status: 'expired', contactType: null, contactCiphertext: null, contactDigest: null, updatedAt: createdAt,
    }));
    assert.deepEqual(await repository.getRegistration(hidden.id), {
      ...hidden,
      status: 'expired',
      contactType: null,
      contactCiphertext: null,
      contactDigest: null,
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
    assert.deepEqual(await repository.moderate(hidden), hidden);
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
