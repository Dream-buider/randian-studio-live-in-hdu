export const SCHOOL_START_AT = '2026-09-16T00:00:00+08:00';

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  complete: boolean;
}

export function getCountdown(targetMs: number, nowMs = Date.now()): CountdownParts {
  const remainingSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));

  return {
    days: Math.floor(remainingSeconds / 86_400),
    hours: Math.floor((remainingSeconds % 86_400) / 3_600),
    minutes: Math.floor((remainingSeconds % 3_600) / 60),
    seconds: remainingSeconds % 60,
    complete: remainingSeconds === 0,
  };
}
