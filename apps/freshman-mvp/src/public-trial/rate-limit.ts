export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface WindowState {
  startedAt: number;
  count: number;
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(sessionId: string, now: number): LimitResult {
    for (const [key, state] of this.windows) {
      if (now - state.startedAt >= this.windowMs) {
        this.windows.delete(key);
      }
    }

    const existing = this.windows.get(sessionId);
    const state = existing ?? { startedAt: now, count: 0 };
    if (!existing) {
      this.windows.set(sessionId, state);
    }
    if (state.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((state.startedAt + this.windowMs - now) / 1_000),
        ),
      };
    }
    state.count += 1;
    return {
      allowed: true,
      remaining: this.limit - state.count,
      retryAfterSeconds: 0,
    };
  }
}
