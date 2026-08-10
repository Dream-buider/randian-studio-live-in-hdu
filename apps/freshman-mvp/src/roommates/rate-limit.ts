import { createHmac } from 'node:crypto';

export const ROOMMATE_RATE_POLICIES = {
  create: { limit: 5, windowMs: 60 * 60 * 1000 },
  recover: { limit: 10, windowMs: 15 * 60 * 1000 },
  members: { limit: 120, windowMs: 60 * 1000 },
} as const;

export type RoommateRateAction = keyof typeof ROOMMATE_RATE_POLICIES;

export interface SlidingWindowRateLimiterOptions {
  maxBuckets?: number;
}

interface RateBucket {
  timestamps: number[];
  expiresAt: number;
}

export class SlidingWindowRateLimiter {
  private readonly secret: Buffer;
  private readonly maxBuckets: number;
  private readonly buckets = new Map<string, RateBucket>();

  constructor(secret: Buffer, options: SlidingWindowRateLimiterOptions = {}) {
    if (secret.length < 32) {
      throw new Error('rate-limit HMAC key must be at least 32 bytes');
    }
    const maxBuckets = options.maxBuckets ?? 10_000;
    if (!Number.isSafeInteger(maxBuckets) || maxBuckets < 1) {
      throw new Error('maxBuckets must be a positive integer');
    }
    this.secret = Buffer.from(secret);
    this.maxBuckets = maxBuckets;
  }

  get size(): number {
    return this.buckets.size;
  }

  consume(action: RoommateRateAction, ip: string, nowMs = Date.now()): void {
    const policy = ROOMMATE_RATE_POLICIES[action];
    this.prune(nowMs);
    const key = createHmac('sha256', this.secret)
      .update(`roommate-rate\0${action}\0${ip}`, 'utf8')
      .digest('base64url');
    const cutoff = nowMs - policy.windowMs;
    const timestamps = (this.buckets.get(key)?.timestamps ?? [])
      .filter((timestamp) => timestamp > cutoff);
    if (timestamps.length >= policy.limit) {
      this.buckets.set(key, {
        timestamps,
        expiresAt: timestamps[timestamps.length - 1]! + policy.windowMs,
      });
      throw new Error('Rate limit exceeded');
    }
    if (!this.buckets.has(key) && this.buckets.size >= this.maxBuckets) {
      throw new Error('Rate limit capacity exceeded');
    }
    timestamps.push(nowMs);
    this.buckets.delete(key);
    this.buckets.set(key, { timestamps, expiresAt: nowMs + policy.windowMs });
  }

  private prune(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= nowMs) {
        this.buckets.delete(key);
      }
    }
  }
}
