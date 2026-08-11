import type { SqliteDatabase } from '../db/sqlite.js';
import type {
  RoommateAdminAuditRecord,
  RoommateRegistrationRecord,
  RoommateRepository,
  RoommateSessionRecord,
  RoommateStatus,
} from '../roommates/models.js';

type Row = Record<string, unknown>;

export class SqliteRoommateRepository implements RoommateRepository {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  async createRegistration(record: RoommateRegistrationRecord): Promise<RoommateRegistrationRecord> {
    return this.inTransaction(() => {
      this.insertRegistration(record);
      return record;
    });
  }

  async createRegistrationWithSession(
    registration: RoommateRegistrationRecord,
    session: RoommateSessionRecord,
  ): Promise<RoommateRegistrationRecord> {
    return this.inTransaction(() => {
      this.insertRegistration(registration);
      this.insertSession(session);
      return registration;
    });
  }

  async getRegistration(id: string): Promise<RoommateRegistrationRecord | null> {
    const row = this.database.prepare('SELECT * FROM roommate_registrations WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toRegistration(row) : null;
  }

  async getRegistrationBySessionDigest(
    sessionDigest: string,
    now: string,
  ): Promise<RoommateRegistrationRecord | null> {
    const row = this.database.prepare(`
      SELECT registrations.*
      FROM roommate_sessions AS sessions
      JOIN roommate_registrations AS registrations ON registrations.id = sessions.registration_id
      WHERE sessions.session_digest = ? AND sessions.expires_at > ?
    `).get(sessionDigest, now) as Row | undefined;
    return row ? this.toRegistration(row) : null;
  }

  async getActiveRegistrationByContactDigest(
    contactDigest: string,
  ): Promise<RoommateRegistrationRecord | null> {
    const row = this.database.prepare(`
      SELECT * FROM roommate_registrations
      WHERE contact_digest = ? AND status = 'active'
    `).get(contactDigest) as Row | undefined;
    return row ? this.toRegistration(row) : null;
  }

  async listActiveMembersForSession(
    sessionDigest: string,
    now: string,
  ): Promise<RoommateRegistrationRecord[] | null> {
    const rows = this.database.prepare(`
      WITH requester AS (
        SELECT registrations.room_key
        FROM roommate_sessions AS sessions
        JOIN roommate_registrations AS registrations
          ON registrations.id = sessions.registration_id
        WHERE sessions.session_digest = ?
          AND sessions.expires_at > ?
          AND registrations.status = 'active'
          AND registrations.expires_at > ?
      )
      SELECT members.*
      FROM roommate_registrations AS members
      JOIN requester ON requester.room_key = members.room_key
      WHERE members.status = 'active' AND members.expires_at > ?
      ORDER BY members.created_at ASC, members.id ASC
    `).all(sessionDigest, now, now, now) as Row[];
    return rows.length === 0 ? null : rows.map((row) => this.toRegistration(row));
  }

  async listActiveMembers(roomKey: string, now: string): Promise<RoommateRegistrationRecord[]> {
    const rows = this.database.prepare(`
      SELECT * FROM roommate_registrations
      WHERE room_key = ? AND status = 'active' AND expires_at > ?
      ORDER BY created_at ASC, id ASC
    `).all(roomKey, now) as Row[];
    return rows.map((row) => this.toRegistration(row));
  }

  async updateRegistration(record: RoommateRegistrationRecord): Promise<RoommateRegistrationRecord> {
    return this.inTransaction(() => {
      const result = this.database.prepare(`
        UPDATE roommate_registrations
        SET campus_code = ?, template_version = ?, room_key = ?, building_key = ?,
            address_ciphertext = ?, nickname_ciphertext = ?, contact_type = ?,
            contact_ciphertext = ?, contact_digest = ?, management_digest = ?, consent_at = ?,
            status = ?, updated_at = ?, expires_at = ?, deleted_at = ?
        WHERE id = ?
      `).run(
        record.campusCode, record.templateVersion, record.roomKey, record.buildingKey,
        record.addressCiphertext, record.nicknameCiphertext, record.contactType,
        record.contactCiphertext, record.contactDigest, record.managementDigest, record.consentAt,
        record.status, record.updatedAt, record.expiresAt, record.deletedAt, record.id,
      );
      if (Number(result.changes) !== 1) {
        throw new Error('Roommate registration not found');
      }
      return record;
    });
  }

  async updateActiveRegistration(
    record: RoommateRegistrationRecord,
    expectedUpdatedAt: string,
  ): Promise<RoommateRegistrationRecord | null> {
    if (record.updatedAt <= expectedUpdatedAt) {
      throw new Error('Updated version must advance');
    }
    return this.inTransaction(() => {
      const result = this.database.prepare(`
        UPDATE roommate_registrations
        SET campus_code = ?, template_version = ?, room_key = ?, building_key = ?,
            address_ciphertext = ?, nickname_ciphertext = ?, contact_type = ?,
            contact_ciphertext = ?, contact_digest = ?, consent_at = ?, updated_at = ?
        WHERE id = ? AND status = 'active' AND updated_at = ?
      `).run(
        record.campusCode, record.templateVersion, record.roomKey, record.buildingKey,
        record.addressCiphertext, record.nicknameCiphertext, record.contactType,
        record.contactCiphertext, record.contactDigest, record.consentAt, record.updatedAt,
        record.id, expectedUpdatedAt,
      );
      return Number(result.changes) === 1 ? { ...record, status: 'active' } : null;
    });
  }

  async createSession(record: RoommateSessionRecord): Promise<RoommateSessionRecord> {
    return this.inTransaction(() => {
      this.insertSession(record);
      return record;
    });
  }

  async revokeSessions(registrationId: string): Promise<void> {
    await this.inTransaction(() => {
      this.database.prepare('DELETE FROM roommate_sessions WHERE registration_id = ?').run(registrationId);
    });
  }

  async expireDue(now: string): Promise<void> {
    await this.inTransaction(() => {
      const dueRows = this.database.prepare(`
        SELECT id FROM roommate_registrations
        WHERE status IN ('active', 'hidden') AND expires_at <= ?
      `).all(now) as Row[];
      if (dueRows.length === 0) {
        return;
      }
      this.database.prepare(`
        UPDATE roommate_registrations
        SET status = 'expired', contact_type = NULL, contact_ciphertext = NULL,
            contact_digest = NULL, updated_at = ?
        WHERE status IN ('active', 'hidden') AND expires_at <= ?
      `).run(now, now);
      const deleteSessions = this.database.prepare(
        'DELETE FROM roommate_sessions WHERE registration_id = ?',
      );
      for (const row of dueRows) {
        deleteSessions.run(String(row.id));
      }
    });
  }

  async listAdmin(status?: RoommateStatus): Promise<RoommateRegistrationRecord[]> {
    const rows = status === undefined
      ? this.database.prepare('SELECT * FROM roommate_registrations ORDER BY created_at ASC, id ASC').all() as Row[]
      : this.database.prepare(`
          SELECT * FROM roommate_registrations WHERE status = ? ORDER BY created_at ASC, id ASC
        `).all(status) as Row[];
    return rows.map((row) => this.toRegistration(row));
  }

  async listLatestAdminAudits(registrationIds: string[]): Promise<RoommateAdminAuditRecord[]> {
    if (registrationIds.length === 0) {
      return [];
    }
    const placeholders = registrationIds.map(() => '?').join(', ');
    const rows = this.database.prepare(`
      SELECT id, registration_id, actor_id, action, reason, created_at
      FROM (
        SELECT audit.*, ROW_NUMBER() OVER (
          PARTITION BY registration_id
          ORDER BY created_at DESC, rowid DESC
        ) AS audit_rank
        FROM roommate_admin_audit AS audit
        WHERE registration_id IN (${placeholders})
      )
      WHERE audit_rank = 1
      ORDER BY registration_id ASC
    `).all(...registrationIds) as Row[];
    return rows.map((row) => this.toAudit(row));
  }

  async moderate(
    record: RoommateRegistrationRecord,
    expected: { status: RoommateStatus; updatedAt: string },
    audit?: RoommateAdminAuditRecord,
  ): Promise<RoommateRegistrationRecord | null> {
    if (record.updatedAt <= expected.updatedAt) {
      throw new Error('Updated version must advance');
    }
    return this.inTransaction(() => {
      const result = this.database.prepare(`
        UPDATE roommate_registrations
        SET status = ?, contact_type = ?, contact_ciphertext = ?, contact_digest = ?,
            consent_at = ?, updated_at = ?, deleted_at = ?
        WHERE id = ? AND status = ? AND updated_at = ?
      `).run(
        record.status, record.contactType, record.contactCiphertext, record.contactDigest,
        record.consentAt, record.updatedAt, record.deletedAt, record.id, expected.status, expected.updatedAt,
      );
      if (Number(result.changes) !== 1) {
        return null;
      }
      if (audit) {
        this.insertAudit(audit);
      }
      if (record.status === 'deleted') {
        this.database.prepare('DELETE FROM roommate_sessions WHERE registration_id = ?').run(record.id);
      }
      return record;
    });
  }

  async appendAudit(record: RoommateAdminAuditRecord): Promise<RoommateAdminAuditRecord> {
    return this.inTransaction(() => {
      this.insertAudit(record);
      return record;
    });
  }

  private insertAudit(record: RoommateAdminAuditRecord): void {
    this.database.prepare(`
      INSERT INTO roommate_admin_audit (id, registration_id, actor_id, action, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(record.id, record.registrationId, record.actorId, record.action, record.reason, record.createdAt);
  }

  private insertRegistration(record: RoommateRegistrationRecord): void {
    this.database.prepare(`
      INSERT INTO roommate_registrations (
        id, campus_code, template_version, room_key, building_key, address_ciphertext,
        nickname_ciphertext, contact_type, contact_ciphertext, contact_digest,
        management_digest, consent_at, status, created_at, updated_at, expires_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.campusCode, record.templateVersion, record.roomKey, record.buildingKey,
      record.addressCiphertext, record.nicknameCiphertext, record.contactType,
      record.contactCiphertext, record.contactDigest, record.managementDigest, record.consentAt,
      record.status, record.createdAt, record.updatedAt, record.expiresAt, record.deletedAt,
    );
  }

  private insertSession(record: RoommateSessionRecord): void {
    this.database.prepare(`
      INSERT INTO roommate_sessions (session_digest, registration_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(record.sessionDigest, record.registrationId, record.createdAt, record.expiresAt);
  }

  private toRegistration(row: Row): RoommateRegistrationRecord {
    return {
      id: String(row.id),
      campusCode: String(row.campus_code) as RoommateRegistrationRecord['campusCode'],
      templateVersion: String(row.template_version),
      roomKey: String(row.room_key),
      buildingKey: String(row.building_key),
      addressCiphertext: String(row.address_ciphertext),
      nicknameCiphertext: String(row.nickname_ciphertext),
      contactType: row.contact_type === null
        ? null
        : String(row.contact_type) as RoommateRegistrationRecord['contactType'],
      contactCiphertext: row.contact_ciphertext === null ? null : String(row.contact_ciphertext),
      contactDigest: row.contact_digest === null ? null : String(row.contact_digest),
      managementDigest: String(row.management_digest),
      consentAt: row.consent_at === null ? null : String(row.consent_at),
      status: String(row.status) as RoommateRegistrationRecord['status'],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      expiresAt: String(row.expires_at),
      deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
    };
  }

  private toAudit(row: Row): RoommateAdminAuditRecord {
    return {
      id: String(row.id),
      registrationId: String(row.registration_id),
      actorId: String(row.actor_id),
      action: String(row.action) as RoommateAdminAuditRecord['action'],
      reason: String(row.reason),
      createdAt: String(row.created_at),
    };
  }

  private inTransaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
