import { createHash } from 'node:crypto';
import { ValidationError } from '../domain/errors.js';
import type { CampusCode } from './models.js';

export type BuildingGroupMime = 'image/png' | 'image/jpeg';

export interface BuildingGroupRecord {
  campusCode: CampusCode;
  building: string;
  imageMime: BuildingGroupMime;
  imageBlob: Buffer;
  imageSha256: string;
  imageSize: number;
  updatedAt: string;
  updatedBy: string;
}

export interface RoommateBuildingGroupRepository {
  get(campus: CampusCode, building: string): Promise<BuildingGroupRecord | null>;
  list(): Promise<BuildingGroupRecord[]>;
  upsert(record: BuildingGroupRecord): Promise<BuildingGroupRecord>;
  delete(campus: CampusCode, building: string): Promise<boolean>;
}

export interface DecodedBuildingGroupImage {
  imageMime: BuildingGroupMime;
  imageBlob: Buffer;
  imageSha256: string;
  imageSize: number;
}

const MAX_IMAGE_SIZE = 1024 * 1024;
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function normalizeBuildingGroupCampus(value: unknown): CampusCode {
  if (value === 'xiasha' || value === 'shaoxing') {
    return value;
  }
  throw new ValidationError('campus is invalid');
}

export function normalizeBuildingGroup(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    throw new ValidationError('building is invalid');
  }
  const canonical = value.trim().replace(/^0+(?=\d)/, '');
  const number = Number(canonical);
  if (!Number.isInteger(number) || number < 1 || number > 40) {
    throw new ValidationError('building is invalid');
  }
  return canonical;
}

function isStrictBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return false;
  }
  return Buffer.from(value, 'base64').toString('base64') === value;
}

function hasJpegHeader(buffer: Buffer): boolean {
  return buffer.length >= 4
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff;
}

export function decodeBuildingGroupImage(
  mimeType: unknown,
  imageBase64: unknown,
): DecodedBuildingGroupImage {
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
    throw new ValidationError('Only PNG and JPEG images are supported');
  }
  if (typeof imageBase64 !== 'string' || !isStrictBase64(imageBase64)) {
    throw new ValidationError('Invalid base64 image');
  }
  const imageBlob = Buffer.from(imageBase64, 'base64');
  if (imageBlob.length === 0) {
    throw new ValidationError('Image file is empty');
  }
  if (imageBlob.length > MAX_IMAGE_SIZE) {
    throw new ValidationError('Image file exceeds 1 MiB');
  }
  const headerMatches = mimeType === 'image/png'
    ? imageBlob.length >= PNG_HEADER.length && imageBlob.subarray(0, PNG_HEADER.length).equals(PNG_HEADER)
    : hasJpegHeader(imageBlob);
  if (!headerMatches) {
    throw new ValidationError('Image content does not match MIME type');
  }
  return {
    imageMime: mimeType,
    imageBlob,
    imageSha256: createHash('sha256').update(imageBlob).digest('hex'),
    imageSize: imageBlob.length,
  };
}
