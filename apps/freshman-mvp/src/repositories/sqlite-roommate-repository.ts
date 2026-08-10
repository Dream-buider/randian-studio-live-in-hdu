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
      return record;
    });
  }

  async getRegistration(id: string): Promise<RoommateRegistrationRecord | null> {
    const row = this.database.prepare('SELECT * FROM roommate_registrations WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toRegistration(row) : null;
  }

  async getRegistrationBySessionDigest(sessionDigest: string): Promise<RoommateRegistrationRecord | null> {
    const row = this.database.prepare(`
      SELECT registrations.*
      FROM roommate_sessions AS sessions
      JOIN roommate_registrations AS registrations ON registrations.id = sessions.registration_id
      WHERE sessions.session_digest = ?
    `).get(sessionDigest) as Row | undefined;
    return row ? this.toRegistration(row) : null;
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

  async createSession(record: RoommateSessionRecord): Promise<RoommateSessionRecord> {
    return this.inTransaction(() => {
      this.database.prepare(`
        INSERT INTO roommate_sessions (session_digest, registration_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(record.sessionDigest, record.registrationId, record.createdAt, record.expiresAt);
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

  async moderate(
    record: RoommateRegistrationRecord,
    audit?: RoommateAdminAuditRecord,
  ): Promise<RoommateRegistrationRecord> {
    return this.inTransaction(() => {
      const result = this.database.prepare(`
        UPDATE roommate_registrations
        SET status = ?, contact_type = ?, contact_ciphertext = ?, contact_digest = ?,
            updated_at = ?, deleted_at = ?
        WHERE id = ?
      `).run(
        record.status, record.contactType, record.contactCiphertext, record.contactDigest,
        record.updatedAt, record.deletedAt, record.id,
      );
      if (Number(result.changes) !== 1) {
        throw new Error('Roommate registration not found');
      }
      if (audit) {
        this.insertAudit(audit);
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
