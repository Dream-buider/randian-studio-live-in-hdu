import { ValidationError } from './errors.js';
import type { SourceRef } from './models.js';

const SOURCE_TYPES = new Set<SourceRef['type']>(['official', 'community', 'student', 'web']);

export function assertStringArray(field: string, value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new ValidationError(`${field} must be an array of strings`);
  }
}

export function assertSourceRefs(value: unknown): asserts value is SourceRef[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('sources must be an array');
  }
  for (const source of value) {
    if (source === null || typeof source !== 'object' || Array.isArray(source)) {
      throw new ValidationError('source must be an object');
    }
    const candidate = source as Partial<SourceRef>;
    if (!SOURCE_TYPES.has(candidate.type as SourceRef['type'])) {
      throw new ValidationError('source type is invalid');
    }
    if (typeof candidate.title !== 'string' || typeof candidate.url !== 'string') {
      throw new ValidationError('source title and url must be strings');
    }
    if (candidate.updatedAt !== null && typeof candidate.updatedAt !== 'string') {
      throw new ValidationError('source updatedAt must be a string or null');
    }
  }
}
