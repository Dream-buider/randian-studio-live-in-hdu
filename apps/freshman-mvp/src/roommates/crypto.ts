import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import type { ContactType } from './models.js';

export interface RoommateCryptoOptions {
  encryptionKey: Buffer;
  hmacKey: Buffer;
}

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class RoommateCrypto {
  private readonly encryptionKey: Buffer;
  private readonly hmacKey: Buffer;

  constructor(options: RoommateCryptoOptions) {
    if (options.encryptionKey.length !== 32) {
      throw new Error('encryptionKey must be exactly 32 bytes');
    }
    if (options.hmacKey.length < 32) {
      throw new Error('hmacKey must be at least 32 bytes');
    }
    this.encryptionKey = Buffer.from(options.encryptionKey);
    this.hmacKey = Buffer.from(options.hmacKey);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv, tag, ciphertext]
      .map((part) => typeof part === 'string' ? part : part.toString('base64url'))
      .join('.');
  }

  decrypt(serialized: string): string {
    try {
      const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = serialized.split('.');
      if (
        version !== VERSION
        || extra.length !== 0
        || !encodedIv || !encodedTag || encodedCiphertext === undefined
        || !BASE64URL.test(encodedIv)
        || !BASE64URL.test(encodedTag)
        || (encodedCiphertext.length > 0 && !BASE64URL.test(encodedCiphertext))
      ) {
        throw new Error('malformed');
      }
      const iv = Buffer.from(encodedIv, 'base64url');
      const tag = Buffer.from(encodedTag, 'base64url');
      const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new Error('malformed');
      }
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Invalid ciphertext');
    }
  }

  roomKey(canonical: string): string {
    return this.digest(`room\0${canonical}`);
  }

  buildingKey(campus: string, building: string): string {
    return this.digest(`building\0${campus}|${building}`);
  }

  contactDigest(type: ContactType, normalizedValue: string): string {
    return this.digest(`contact\0${type}|${normalizedValue}`);
  }

  managementDigest(code: string): string {
    return this.digest(`management\0${code}`);
  }

  sessionDigest(token: string): string {
    return this.digest(`session\0${token}`);
  }

  newManagementCode(): string {
    return randomBytes(32).toString('base64url');
  }

  newSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private digest(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value, 'utf8').digest('base64url');
  }
}
