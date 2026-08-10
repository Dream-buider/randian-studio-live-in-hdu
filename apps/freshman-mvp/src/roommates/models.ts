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

export interface RoommateRegistrationRecord {
  id: string;
  campusCode: CampusCode;
  templateVersion: string;
  roomKey: string;
  buildingKey: string;
  addressCiphertext: string;
  nicknameCiphertext: string;
  contactType: ContactType | null;
  contactCiphertext: string | null;
  contactDigest: string | null;
  managementDigest: string;
  consentAt: string | null;
  status: RoommateStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  deletedAt: string | null;
}

export interface RoommateSessionRecord {
  sessionDigest: string;
  registrationId: string;
  createdAt: string;
  expiresAt: string;
}

export interface RoommateAdminAuditRecord {
  id: string;
  registrationId: string;
  actorId: string;
  action: string;
  reason: string;
  createdAt: string;
}

export interface RoommateRepository {
  createRegistration(record: RoommateRegistrationRecord): Promise<RoommateRegistrationRecord>;
  getRegistration(id: string): Promise<RoommateRegistrationRecord | null>;
  getRegistrationBySessionDigest(sessionDigest: string): Promise<RoommateRegistrationRecord | null>;
  listActiveMembers(roomKey: string, now: string): Promise<RoommateRegistrationRecord[]>;
  updateRegistration(record: RoommateRegistrationRecord): Promise<RoommateRegistrationRecord>;
  createSession(record: RoommateSessionRecord): Promise<RoommateSessionRecord>;
  revokeSessions(registrationId: string): Promise<void>;
  expireDue(now: string): Promise<void>;
  listAdmin(status?: RoommateStatus): Promise<RoommateRegistrationRecord[]>;
  moderate(
    record: RoommateRegistrationRecord,
    audit?: RoommateAdminAuditRecord,
  ): Promise<RoommateRegistrationRecord>;
  appendAudit(record: RoommateAdminAuditRecord): Promise<RoommateAdminAuditRecord>;
}
