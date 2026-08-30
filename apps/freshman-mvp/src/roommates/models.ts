export type CampusCode = 'xiasha' | 'shaoxing';
export type RoomOrientation = 'east' | 'south' | 'west' | 'north' | 'unknown';
export type BedNumber = '1' | '2' | '3' | '4' | '5';
export type ContactType = 'wechat' | 'qq' | 'phone' | 'other';
export type WritableContactType = Exclude<ContactType, 'other'>;
export type RoommateStatus = 'active' | 'hidden' | 'deleted' | 'expired';
export type RoommateAdminAuditAction = 'view_contact' | 'hide' | 'restore' | 'delete';

export interface RoomAddressInput {
  campus: CampusCode;
  building: string;
  orientation: RoomOrientation;
  room: string;
  bed?: BedNumber | null;
}

export interface NormalizedRoomAddress extends RoomAddressInput {
  bed: BedNumber | null;
  templateVersion: 'xiasha-v1' | 'shaoxing-v1';
  canonical: string;
  display: string;
}

export interface RoommateRegistrationRecord {
  id: string;
  campusCode: CampusCode;
  templateVersion: string;
  roomKey: string;
  bedKey: string | null;
  buildingKey: string;
  addressCiphertext: string;
  nicknameCiphertext: string;
  contactType: ContactType | null;
  contactCiphertext: string | null;
  contactDigest: string | null;
  contacts?: RoommateRegistrationContactRecord[];
  managementDigest: string;
  consentAt: string | null;
  status: RoommateStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  deletedAt: string | null;
}

export interface RoommateRegistrationContactRecord {
  registrationId: string;
  type: ContactType;
  ciphertext: string;
  digest: string;
  createdAt: string;
  updatedAt: string;
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
  action: RoommateAdminAuditAction;
  reason: string;
  createdAt: string;
}

export interface RoommateRepository {
  createRegistration(record: RoommateRegistrationRecord): Promise<RoommateRegistrationRecord>;
  createRegistrationWithSession(
    registration: RoommateRegistrationRecord,
    session: RoommateSessionRecord,
  ): Promise<RoommateRegistrationRecord>;
  getRegistration(id: string): Promise<RoommateRegistrationRecord | null>;
  getRegistrationBySessionDigest(sessionDigest: string, now: string): Promise<RoommateRegistrationRecord | null>;
  listActiveMembersForSession(
    sessionDigest: string,
    now: string,
  ): Promise<RoommateRegistrationRecord[] | null>;
  getActiveRegistrationByContactDigest(contactDigest: string): Promise<RoommateRegistrationRecord | null>;
  listActiveMembers(roomKey: string, now: string): Promise<RoommateRegistrationRecord[]>;
  updateRegistration(record: RoommateRegistrationRecord): Promise<RoommateRegistrationRecord>;
  updateSelfRegistration(
    record: RoommateRegistrationRecord,
    expectedUpdatedAt: string,
    expectedStatus: 'active' | 'hidden',
  ): Promise<RoommateRegistrationRecord | null>;
  createSession(record: RoommateSessionRecord): Promise<RoommateSessionRecord>;
  revokeSessions(registrationId: string): Promise<void>;
  expireDue(now: string): Promise<void>;
  listAdmin(status?: RoommateStatus): Promise<RoommateRegistrationRecord[]>;
  listLatestAdminAudits(registrationIds: string[]): Promise<RoommateAdminAuditRecord[]>;
  moderate(
    record: RoommateRegistrationRecord,
    expected: { status: RoommateStatus; updatedAt: string },
    audit?: RoommateAdminAuditRecord,
  ): Promise<RoommateRegistrationRecord | null>;
  appendAudit(record: RoommateAdminAuditRecord): Promise<RoommateAdminAuditRecord>;
}
