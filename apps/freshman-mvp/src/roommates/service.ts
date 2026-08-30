import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { normalizeRoomAddress } from './address-templates.js';
import { RoommateCrypto } from './crypto.js';
import type {
  ContactType,
  NormalizedRoomAddress,
  RoomAddressInput,
  RoommateAdminAuditRecord,
  RoommateAdminAuditAction,
  RoommateRegistrationContactRecord,
  RoommateRegistrationRecord,
  RoommateRepository,
  RoommateStatus,
  WritableContactType,
} from './models.js';
import { SlidingWindowRateLimiter } from './rate-limit.js';

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const INVALID_SESSION = 'Invalid or expired session';
const INVALID_RECOVERY = 'Registration or management code invalid';

export interface RoommateRequestContext {
  ip: string;
  sessionToken?: string;
}

export interface RoommateCreateInput {
  address: RoomAddressInput;
  nickname: string;
  contactType: ContactType | null;
  contactValue: string | null;
  contacts?: RoommateContactInput[];
  consent: boolean;
}

export type RoommateUpdateInput = RoommateCreateInput;

export interface RoommateContactView {
  type: ContactType;
  value: string;
}

export interface RoommateContactInput {
  type: WritableContactType;
  value: string;
}

export interface RoommateOwnView {
  id: string;
  address: NormalizedRoomAddress;
  nickname: string;
  contact: RoommateContactView | null;
  contacts: RoommateContactView[];
  status: RoommateStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  deletedAt: string | null;
}

export interface RoommateMemberView {
  id: string;
  nickname: string;
  bed: NormalizedRoomAddress['bed'];
  contact: RoommateContactView | null;
  contacts: RoommateContactView[];
}

export interface RoommateAdminView extends Omit<RoommateOwnView, 'contact' | 'contacts'> {
  contact: { type: ContactType; masked: true } | null;
  contacts: Array<{ type: ContactType; masked: true }>;
  lastModeration: RoommateAdminModerationView | null;
}

export interface RoommateAdminModerationView {
  actorId: string;
  action: RoommateAdminAuditAction;
  reason: string;
  createdAt: string;
}

export interface RoommateAdminContactReveal {
  contact: RoommateContactView;
  contacts: RoommateContactView[];
  lastModeration: RoommateAdminModerationView;
}

export interface RoommateCreateResult {
  registrationId: string;
  managementCode: string | null;
  sessionToken: string;
  own: RoommateOwnView;
  members: RoommateMemberView[];
}

export interface RoommateRecoveryResult {
  registrationId: string;
  sessionToken: string;
  own: RoommateOwnView;
}

export interface RoommateModerationInput {
  action: 'hide' | 'restore' | 'delete';
  actorId: string;
  reason: string;
}

export interface RoommateServiceOptions {
  limiter?: SlidingWindowRateLimiter;
  rateLimitKey?: Buffer;
  now?: () => Date;
  id?: (prefix: 'registration' | 'audit') => string;
}

interface ValidatedInput {
  address: NormalizedRoomAddress;
  nickname: string;
  contacts: Array<RoommateContactInput & { normalizedValue: string }>;
  preserveContacts: boolean;
  consent: boolean;
}

type SelfManageableRegistration = RoommateRegistrationRecord & {
  status: 'active' | 'hidden';
};

export class RoommateService {
  private readonly repository: RoommateRepository;
  private readonly crypto: RoommateCrypto;
  private readonly limiter: SlidingWindowRateLimiter;
  private readonly now: () => Date;
  private readonly id: (prefix: 'registration' | 'audit') => string;

  constructor(repository: RoommateRepository, crypto: RoommateCrypto, options: RoommateServiceOptions = {}) {
    this.repository = repository;
    this.crypto = crypto;
    this.limiter = options.limiter ?? new SlidingWindowRateLimiter(
      options.rateLimitKey ?? randomBytes(32),
    );
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? ((prefix) => `${prefix}-${randomUUID()}`);
  }

  async create(input: RoommateCreateInput, context: RoommateRequestContext): Promise<RoommateCreateResult> {
    const now = this.timestamp();
    this.limiter.consume('create', this.requireIp(context), Date.parse(now));
    if (context.sessionToken !== undefined) {
      const existing = await this.authenticateSelf(context.sessionToken, now);
      const members = existing.status === 'active'
        ? await this.membersForSession(context.sessionToken, now)
        : [];
      return {
        registrationId: existing.id,
        managementCode: null,
        sessionToken: context.sessionToken,
        own: this.toOwn(existing),
        members,
      };
    }

    const validated = this.validateInput(input);
    const digests = validated.contacts.map((contact) => (
      this.crypto.contactDigest(contact.type, contact.normalizedValue)
    ));
    for (const digest of digests) {
      if (await this.repository.getActiveRegistrationByContactDigest(digest)) {
        throw new Error('Contact already has an active registration');
      }
    }
    const managementCode = this.crypto.newManagementCode();
    const sessionToken = this.crypto.newSessionToken();
    const expiresAt = new Date(Date.parse(now) + RETENTION_MS).toISOString();
    const registrationId = this.id('registration');
    const contacts = this.encryptContacts(registrationId, validated.contacts, now);
    const legacy = contacts[0] ?? null;
    const record: RoommateRegistrationRecord = {
      id: registrationId,
      campusCode: validated.address.campus,
      templateVersion: validated.address.templateVersion,
      roomKey: this.crypto.roomKey(validated.address.canonical),
      bedKey: this.crypto.bedKey(validated.address.canonical, validated.address.bed),
      buildingKey: this.crypto.buildingKey(validated.address.campus, validated.address.building),
      addressCiphertext: this.crypto.encrypt(JSON.stringify(validated.address)),
      nicknameCiphertext: this.crypto.encrypt(validated.nickname),
      contactType: legacy?.type ?? null,
      contactCiphertext: legacy?.ciphertext ?? null,
      contactDigest: legacy?.digest ?? null,
      contacts,
      managementDigest: this.crypto.managementDigest(managementCode),
      consentAt: validated.consent ? now : null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      expiresAt,
      deletedAt: null,
    };
    const session = {
      sessionDigest: this.crypto.sessionDigest(sessionToken),
      registrationId: record.id,
      createdAt: now,
      expiresAt,
    };
    try {
      await this.repository.createRegistrationWithSession(record, session);
    } catch (error) {
      for (const digest of digests) {
        if (await this.repository.getActiveRegistrationByContactDigest(digest)) {
          throw new Error('Contact already has an active registration');
        }
      }
      throw error;
    }
    return {
      registrationId: record.id,
      managementCode,
      sessionToken,
      own: this.toOwn(record),
      members: await this.membersForSession(sessionToken, now),
    };
  }

  async getMine(sessionToken: string, _context: RoommateRequestContext): Promise<RoommateOwnView> {
    return this.toOwn(await this.authenticateSelf(sessionToken, this.timestamp()));
  }

  async updateMine(
    sessionToken: string,
    input: RoommateUpdateInput,
    _context: RoommateRequestContext,
  ): Promise<RoommateOwnView> {
    const now = this.timestamp();
    const current = await this.authenticateSelf(sessionToken, now);
    const validated = this.validateInput(input, current);
    const contacts = validated.preserveContacts
      ? current.contacts ?? []
      : this.encryptContacts(current.id, validated.contacts, now);
    for (const contact of contacts) {
      const duplicate = await this.repository.getActiveRegistrationByContactDigest(contact.digest);
      if (duplicate && duplicate.id !== current.id) {
        throw new Error('Contact already has an active registration');
      }
    }
    const legacy = contacts[0] ?? null;
    const updated: RoommateRegistrationRecord = {
      ...current,
      campusCode: validated.address.campus,
      templateVersion: validated.address.templateVersion,
      roomKey: this.crypto.roomKey(validated.address.canonical),
      bedKey: this.crypto.bedKey(validated.address.canonical, validated.address.bed),
      buildingKey: this.crypto.buildingKey(validated.address.campus, validated.address.building),
      addressCiphertext: this.crypto.encrypt(JSON.stringify(validated.address)),
      nicknameCiphertext: this.crypto.encrypt(validated.nickname),
      contactType: legacy?.type ?? null,
      contactCiphertext: legacy?.ciphertext ?? null,
      contactDigest: legacy?.digest ?? null,
      contacts,
      consentAt: contacts.length > 0 ? current.consentAt ?? now : null,
      updatedAt: this.nextVersion(current.updatedAt, now),
    };
    const persisted = await this.repository.updateSelfRegistration(
      updated,
      current.updatedAt,
      current.status,
    );
    if (!persisted) {
      throw new Error('Concurrent registration change');
    }
    return this.toOwn(persisted);
  }

  async deleteMine(sessionToken: string, _context: RoommateRequestContext): Promise<void> {
    const now = this.timestamp();
    const current = await this.authenticateSelf(sessionToken, now);
    const deleted = await this.repository.moderate(
      this.deletedRecord(current, now),
      { status: current.status, updatedAt: current.updatedAt },
    );
    if (!deleted) {
      throw new Error(INVALID_SESSION);
    }
  }

  async recover(
    registrationId: string,
    managementCode: string,
    context: RoommateRequestContext,
  ): Promise<RoommateRecoveryResult> {
    const now = this.timestamp();
    this.limiter.consume('recover', this.requireIp(context), Date.parse(now));
    const record = await this.repository.getRegistration(registrationId);
    const suppliedDigest = this.crypto.managementDigest(managementCode);
    const expectedDigest = record?.managementDigest ?? this.crypto.managementDigest('missing-registration');
    const matches = this.constantTimeEqual(suppliedDigest, expectedDigest);
    if (
      !record
      || !matches
      || !['active', 'hidden'].includes(record.status)
      || record.expiresAt <= now
    ) {
      throw new Error(INVALID_RECOVERY);
    }
    const sessionToken = this.crypto.newSessionToken();
    await this.repository.createSession({
      sessionDigest: this.crypto.sessionDigest(sessionToken),
      registrationId: record.id,
      createdAt: now,
      expiresAt: record.expiresAt,
    });
    return { registrationId: record.id, sessionToken, own: this.toOwn(record) };
  }

  async listMembers(sessionToken: string, context: RoommateRequestContext): Promise<RoommateMemberView[]> {
    const now = this.timestamp();
    this.limiter.consume('members', this.requireIp(context), Date.parse(now));
    return this.membersForSession(sessionToken, now);
  }

  async listAdmin(actorId: string, reason: string, status?: RoommateStatus): Promise<RoommateAdminView[]> {
    this.validateAdmin(actorId, reason);
    const records = await this.repository.listAdmin(status);
    const latestAudits = await this.repository.listLatestAdminAudits(records.map((record) => record.id));
    const auditByRegistration = new Map(latestAudits.map((audit) => [audit.registrationId, audit]));
    return records.map((record) => this.toAdmin(record, auditByRegistration.get(record.id) ?? null));
  }

  async revealAdminContact(
    registrationId: string,
    actorId: string,
    reason: string,
  ): Promise<RoommateAdminContactReveal> {
    this.validateAdmin(actorId, reason);
    const record = await this.repository.getRegistration(registrationId);
    if (!record || (record.contacts ?? []).length === 0) {
      throw new Error('Contact unavailable');
    }
    const audit = this.audit(record.id, actorId, 'view_contact', reason);
    await this.repository.appendAudit(audit);
    const contacts = this.contactViews(record);
    return {
      contact: contacts[0]!,
      contacts,
      lastModeration: this.toAdminModeration(audit),
    };
  }

  async moderate(registrationId: string, input: RoommateModerationInput): Promise<RoommateAdminView> {
    this.validateAdmin(input.actorId, input.reason);
    const now = this.timestamp();
    const current = await this.repository.getRegistration(registrationId);
    if (!current) {
      throw new Error('Registration not found');
    }
    let updated: RoommateRegistrationRecord;
    if (input.action === 'hide') {
      if (current.status !== 'active') {
        throw new Error('Only active registrations can be hidden');
      }
      updated = { ...current, status: 'hidden', updatedAt: this.nextVersion(current.updatedAt, now) };
    } else if (input.action === 'restore') {
      if (current.status !== 'hidden') {
        throw new Error('Only hidden registrations can be restored');
      }
      if (current.expiresAt <= now) {
        throw new Error('Expired registrations cannot be restored');
      }
      updated = { ...current, status: 'active', updatedAt: this.nextVersion(current.updatedAt, now) };
    } else if (input.action === 'delete') {
      if (current.status === 'deleted' || current.status === 'expired') {
        throw new Error('Registration cannot be deleted');
      }
      updated = this.deletedRecord(current, now);
    } else {
      throw new Error('Invalid moderation action');
    }
    const audit = this.audit(current.id, input.actorId, input.action, input.reason);
    const persisted = await this.repository.moderate(
      updated,
      { status: current.status, updatedAt: current.updatedAt },
      audit,
    );
    if (!persisted) {
      throw new Error('Concurrent registration change');
    }
    return this.toAdmin(persisted, audit);
  }

  async runRetention(): Promise<void> {
    await this.repository.expireDue(this.timestamp());
  }

  private async authenticateSelf(sessionToken: string, now: string): Promise<SelfManageableRegistration> {
    const record = await this.repository.getRegistrationBySessionDigest(
      this.crypto.sessionDigest(sessionToken),
      now,
    );
    if (
      !record
      || (record.status !== 'active' && record.status !== 'hidden')
      || record.expiresAt <= now
    ) {
      throw new Error(INVALID_SESSION);
    }
    return { ...record, status: record.status };
  }

  private async membersForSession(sessionToken: string, now: string): Promise<RoommateMemberView[]> {
    const members = await this.repository.listActiveMembersForSession(
      this.crypto.sessionDigest(sessionToken),
      now,
    );
    if (!members) {
      throw new Error(INVALID_SESSION);
    }
    return members.map((member) => ({
      id: member.id,
      nickname: this.crypto.decrypt(member.nicknameCiphertext),
      bed: this.readAddress(member.addressCiphertext).bed,
      contact: this.contactViews(member)[0] ?? null,
      contacts: this.contactViews(member),
    }));
  }

  private validateInput(
    input: RoommateCreateInput,
    current?: RoommateRegistrationRecord,
  ): ValidatedInput {
    const address = normalizeRoomAddress(input.address);
    const nickname = input.nickname.trim();
    if (/\p{Cc}/u.test(input.nickname) || [...nickname].length < 1 || [...nickname].length > 30) {
      throw new Error('Nickname must contain 1-30 Unicode code points without controls');
    }
    if (input.contacts === undefined && current?.contacts?.some((contact) => contact.type === 'other')) {
      return { address, nickname, contacts: [], preserveContacts: true, consent: true };
    }
    const supplied = input.contacts ?? this.legacyInputContacts(input);
    if (supplied.length > 3) throw new Error('At most three contacts are allowed');
    const seen = new Set<string>();
    const contacts = supplied.map((contact) => {
      if (!['wechat', 'qq', 'phone'].includes(contact.type)) {
        throw new Error('Contact type is invalid');
      }
      if (seen.has(contact.type)) throw new Error('Contact types must be unique');
      seen.add(contact.type);
      const value = contact.value.trim();
      if (/\p{Cc}/u.test(contact.value) || [...value].length < 1 || [...value].length > 100) {
        throw new Error('Contact value is invalid');
      }
      if (contact.type === 'qq' && !/^[1-9]\d{4,11}$/.test(value)) {
        throw new Error('QQ contact is invalid');
      }
      if (contact.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) {
        throw new Error('Phone contact is invalid');
      }
      return { ...contact, value, normalizedValue: value.toLocaleLowerCase('en-US') };
    });
    if (contacts.length > 0 && !input.consent) throw new Error('Contact consent is required');
    if (contacts.length === 0 && input.consent) throw new Error('Contact consent must be false without contacts');
    return { address, nickname, contacts, preserveContacts: false, consent: contacts.length > 0 };
  }

  private legacyInputContacts(input: RoommateCreateInput): RoommateContactInput[] {
    const paired = input.contactType !== null && input.contactValue !== null;
    if (paired !== (input.contactType !== null || input.contactValue !== null)) {
      throw new Error('Contact type and value must be provided together');
    }
    if (input.contactType === null || input.contactValue === null) return [];
    return [{ type: input.contactType as WritableContactType, value: input.contactValue }];
  }

  private encryptContacts(
    registrationId: string,
    contacts: ValidatedInput['contacts'],
    now: string,
  ): RoommateRegistrationContactRecord[] {
    return contacts.map((contact) => ({
      registrationId,
      type: contact.type,
      ciphertext: this.crypto.encrypt(contact.value),
      digest: this.crypto.contactDigest(contact.type, contact.normalizedValue),
      createdAt: now,
      updatedAt: now,
    }));
  }

  private contactViews(record: RoommateRegistrationRecord): RoommateContactView[] {
    return (record.contacts ?? []).map((contact) => ({
      type: contact.type,
      value: this.crypto.decrypt(contact.ciphertext),
    }));
  }

  private toOwn(record: RoommateRegistrationRecord): RoommateOwnView {
    const contacts = this.contactViews(record);
    return {
      id: record.id,
      address: this.readAddress(record.addressCiphertext),
      nickname: this.crypto.decrypt(record.nicknameCiphertext),
      contact: contacts[0] ?? null,
      contacts,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
      deletedAt: record.deletedAt,
    };
  }

  private toAdmin(
    record: RoommateRegistrationRecord,
    lastModeration: RoommateAdminAuditRecord | null,
  ): RoommateAdminView {
    const contacts = (record.contacts ?? []).map(({ type }) => ({ type, masked: true as const }));
    return {
      id: record.id,
      address: this.readAddress(record.addressCiphertext),
      nickname: this.crypto.decrypt(record.nicknameCiphertext),
      contact: contacts[0] ?? null,
      contacts,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
      deletedAt: record.deletedAt,
      lastModeration: lastModeration ? this.toAdminModeration(lastModeration) : null,
    };
  }

  private readAddress(ciphertext: string): NormalizedRoomAddress {
    const address = JSON.parse(this.crypto.decrypt(ciphertext)) as NormalizedRoomAddress;
    if (!Object.prototype.hasOwnProperty.call(address, 'bed')) {
      address.bed = null;
    }
    return address;
  }

  private toAdminModeration(audit: RoommateAdminAuditRecord): RoommateAdminModerationView {
    return {
      actorId: audit.actorId,
      action: audit.action,
      reason: audit.reason,
      createdAt: audit.createdAt,
    };
  }

  private deletedRecord(record: RoommateRegistrationRecord, now: string): RoommateRegistrationRecord {
    return {
      ...record,
      contactType: null,
      contactCiphertext: null,
      contactDigest: null,
      contacts: [],
      consentAt: null,
      status: 'deleted',
      updatedAt: this.nextVersion(record.updatedAt, now),
      deletedAt: now,
    };
  }

  private audit(
    registrationId: string,
    actorId: string,
    action: RoommateAdminAuditAction,
    reason: string,
  ): RoommateAdminAuditRecord {
    return {
      id: this.id('audit'),
      registrationId,
      actorId,
      action,
      reason: reason.trim(),
      createdAt: this.timestamp(),
    };
  }

  private validateAdmin(actorId: string, reason: string): void {
    if (actorId !== 'local-admin') {
      throw new Error('Invalid admin actor');
    }
    if (reason.trim().length === 0) {
      throw new Error('Admin reason is required');
    }
  }

  private requireIp(context: RoommateRequestContext): string {
    if (context.ip.trim().length === 0) {
      throw new Error('Request IP is required');
    }
    return context.ip;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private nextVersion(current: string, now: string): string {
    return new Date(Math.max(Date.parse(now), Date.parse(current) + 1)).toISOString();
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
      timingSafeEqual(leftBuffer, leftBuffer);
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
