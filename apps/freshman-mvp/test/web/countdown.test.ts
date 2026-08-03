import { describe, expect, it } from 'vitest';
import { getCountdown } from '../../web/countdown.js';

describe('getCountdown', () => {
  it('decomposes the remaining whole seconds into conventional units', () => {
    const target = Date.parse('2026-09-16T00:00:00+08:00');
    const now = target - (((2 * 24 + 3) * 60 * 60 + 4 * 60 + 5) * 1000);

    expect(getCountdown(target, now)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      complete: false,
    });
  });

  it('floors partial seconds before crossing a minute boundary', () => {
    const target = 100_000;

    expect(getCountdown(target, 39_100)).toEqual({
      days: 0,
      hours: 0,
      minutes: 1,
      seconds: 0,
      complete: false,
    });
  });

  it('clamps every value to zero after the target time', () => {
    expect(getCountdown(1_000, 1_001)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      complete: true,
    });
  });
});
