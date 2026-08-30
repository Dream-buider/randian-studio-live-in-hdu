import type { SqliteDatabase } from '../db/sqlite.js';
import type {
  RoommateAdminAuditRecord,
  RoommateRegistrationContactRecord,
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
    const row = (this.database.prepare(`
      SELECT registrations.*
      FROM roommate_registration_contacts AS contacts
      JOIN roommate_registrations AS registrations ON registrations.id = contacts.registration_id
      WHERE contacts.active_digest = ? AND registrations.status = 'active'
      LIMIT 1
    `).get(contactDigest) ?? this.database.prepare(`
      SELECT registrations.* FROM roommate_registrations AS registrations
      WHERE registrations.contact_digest = ? AND registrations.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM roommate_registration_contacts AS contacts
          WHERE contacts.registration_id = registrations.id
        )
      LIMIT 1
    `).get(contactDigest)) as Row | undefined;
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
        SET campus_code = ?, template_version = ?, room_key = ?, bed_key = ?, building_key = ?,
            address_ciphertext = ?, nickname_ciphertext = ?, contact_type = ?,
            contact_ciphertext = ?, contact_digest = ?, management_digest = ?, consent_at = ?,
            status = ?, updated_at = ?, expires_at = ?, deleted_at = ?
        WHERE id = ?
      `).run(
        record.campusCode, record.templateVersion, record.roomKey, record.bedKey, record.buildingKey,
        record.addressCiphertext, record.nicknameCiphertext, record.contactType,
        record.contactCiphertext, record.contactDigest, record.managementDigest, record.consentAt,
        record.status, record.updatedAt, record.expiresAt, record.deletedAt, record.id,
      );
      if (Number(result.changes) !== 1) {
        throw new Error('Roommate registration not found');
      }
      this.syncContacts(record);
      return record;
    });
  }

  async updateSelfRegistration(
    record: RoommateRegistrationRecord,
    expectedUpdatedAt: string,
    expectedStatus: 'active' | 'hidden',
  ): Promise<RoommateRegistrationRecord | null> {
    if (record.updatedAt <= expectedUpdatedAt) {
      throw new Error('Updated version must advance');
    }
    return this.inTransaction(() => {
      const result = this.database.prepare(`
        UPDATE roommate_registrations
        SET campus_code = ?, template_version = ?, room_key = ?, bed_key = ?, building_key = ?,
            address_ciphertext = ?, nickname_ciphertext = ?, contact_type = ?,
            contact_ciphertext = ?, contact_digest = ?, consent_at = ?, updated_at = ?
        WHERE id = ? AND status = ? AND updated_at = ?
      `).run(
        record.campusCode, record.templateVersion, record.roomKey, record.bedKey, record.buildingKey,
        record.addressCiphertext, record.nicknameCiphertext, record.contactType,
        record.contactCiphertext, record.contactDigest, record.consentAt, record.updatedAt,
        record.id, expectedStatus, expectedUpdatedAt,
      );
      if (Number(result.changes) !== 1) return null;
      const persisted = { ...record, status: expectedStatus };
      this.syncContacts(persisted);
      return persisted;
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
            contact_digest = NULL, consent_at = NULL, updated_at = ?
        WHERE status IN ('active', 'hidden') AND expires_at <= ?
      `).run(now, now);
      const deleteContacts = this.database.prepare(
        'DELETE FROM roommate_registration_contacts WHERE registration_id = ?',
      );
      const deleteSessions = this.database.prepare(
        'DELETE FROM roommate_sessions WHERE registration_id = ?',
      );
      for (const row of dueRows) {
        deleteContacts.run(String(row.id));
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
      this.syncContacts(record);
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
        id, campus_code, template_version, room_key, bed_key, building_key, address_ciphertext,
        nickname_ciphertext, contact_type, contact_ciphertext, contact_digest,
        management_digest, consent_at, status, created_at, updated_at, expires_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.campusCode, record.templateVersion, record.roomKey, record.bedKey, record.buildingKey,
      record.addressCiphertext, record.nicknameCiphertext, record.contactType,
      record.contactCiphertext, record.contactDigest, record.managementDigest, record.consentAt,
      record.status, record.createdAt, record.updatedAt, record.expiresAt, record.deletedAt,
    );
    this.syncContacts(record);
  }

  private syncContacts(record: RoommateRegistrationRecord): void {
    this.database.prepare(
      'DELETE FROM roommate_registration_contacts WHERE registration_id = ?',
    ).run(record.id);
    if (record.status === 'deleted' || record.status === 'expired') return;
    const insert = this.database.prepare(`
      INSERT INTO roommate_registration_contacts (
        registration_id, contact_type, contact_ciphertext, contact_digest,
        active_digest, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const contact of record.contacts ?? this.legacyContacts(record)) {
      insert.run(
        record.id,
        contact.type,
        contact.ciphertext,
        contact.digest,
        record.status === 'active' ? contact.digest : null,
        contact.createdAt,
        contact.updatedAt,
      );
    }
  }

  private insertSession(record: RoommateSessionRecord): void {
    this.database.prepare(`
      INSERT INTO roommate_sessions (session_digest, registration_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(record.sessionDigest, record.registrationId, record.createdAt, record.expiresAt);
  }

  private toRegistration(row: Row): RoommateRegistrationRecord {
    const contacts = this.readContacts(String(row.id), row);
    return {
      id: String(row.id),
      campusCode: String(row.campus_code) as RoommateRegistrationRecord['campusCode'],
      templateVersion: String(row.template_version),
      roomKey: String(row.room_key),
      bedKey: row.bed_key === null || row.bed_key === undefined ? null : String(row.bed_key),
      buildingKey: String(row.building_key),
      addressCiphertext: String(row.address_ciphertext),
      nicknameCiphertext: String(row.nickname_ciphertext),
      contactType: row.contact_type === null
        ? null
        : String(row.contact_type) as RoommateRegistrationRecord['contactType'],
      contactCiphertext: row.contact_ciphertext === null ? null : String(row.contact_ciphertext),
      contactDigest: row.contact_digest === null ? null : String(row.contact_digest),
      contacts,
      managementDigest: String(row.management_digest),
      consentAt: row.consent_at === null ? null : String(row.consent_at),
      status: String(row.status) as RoommateRegistrationRecord['status'],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      expiresAt: String(row.expires_at),
      deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
    };
  }

  private readContacts(registrationId: string, parent: Row): RoommateRegistrationContactRecord[] {
    const rows = this.database.prepare(`
      SELECT registration_id, contact_type, contact_ciphertext, contact_digest, created_at, updated_at
      FROM roommate_registration_contacts
      WHERE registration_id = ?
      ORDER BY CASE contact_type
        WHEN 'wechat' THEN 1 WHEN 'qq' THEN 2 WHEN 'phone' THEN 3 ELSE 4 END
    `).all(registrationId) as Row[];
    if (rows.length > 0) {
      return rows.map((contact) => ({
        registrationId: String(contact.registration_id),
        type: String(contact.contact_type) as RoommateRegistrationContactRecord['type'],
        ciphertext: String(contact.contact_ciphertext),
        digest: String(contact.contact_digest),
        createdAt: String(contact.created_at),
        updatedAt: String(contact.updated_at),
      }));
    }
    if (parent.contact_type === null || parent.contact_ciphertext === null || parent.contact_digest === null) {
      return [];
    }
    return [{
      registrationId,
      type: String(parent.contact_type) as RoommateRegistrationContactRecord['type'],
      ciphertext: String(parent.contact_ciphertext),
      digest: String(parent.contact_digest),
      createdAt: String(parent.created_at),
      updatedAt: String(parent.updated_at),
    }];
  }

  private legacyContacts(record: RoommateRegistrationRecord): RoommateRegistrationContactRecord[] {
    if (!record.contactType || !record.contactCiphertext || !record.contactDigest) return [];
    return [{
      registrationId: record.id,
      type: record.contactType,
      ciphertext: record.contactCiphertext,
      digest: record.contactDigest,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }];
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
      const message = error instanceof Error ? error.message : '';
      if (message.includes('roommate_registrations.room_key') && message.includes('roommate_registrations.bed_key')) {
        throw new Error('Bed already occupied');
      }
      if (
        message.includes('roommate_registration_contacts.active_digest')
        || message.includes('roommate_registrations.contact_digest')
      ) {
        throw new Error('Contact already has an active registration');
      }
      throw error;
    }
  }
}
