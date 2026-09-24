import { describe, expect, it } from 'vitest';
import { calculateAmount, durationMinutes, parseTimeMinutes } from '../src/compensation/calculation.js';

describe('compensation calculation', () => {
  it('parses SQL times and computes positive durations', () => {
    expect(parseTimeMinutes('09:05:00')).toBe(545);
    expect(durationMinutes('09:30', '10:15')).toBe(45);
  });

  it('rejects invalid or non-positive durations', () => {
    expect(() => parseTimeMinutes('24:00')).toThrow();
    expect(() => durationMinutes('10:00', '10:00')).toThrow();
    expect(() => durationMinutes('11:00', '10:00')).toThrow();
  });

  it('uses integer VND arithmetic for session and hourly rates', () => {
    expect(calculateAmount(300_000n, 'PER_SESSION')).toBe(300_000n);
    expect(calculateAmount(120_000n, 'PER_HOUR', 30)).toBe(60_000n);
    expect(calculateAmount(120_000n, 'PER_HOUR', 45)).toBe(90_000n);
    expect(calculateAmount(120_000n, 'PER_HOUR', 60)).toBe(120_000n);
    expect(calculateAmount(120_000n, 'PER_HOUR', 90)).toBe(180_000n);
    expect(calculateAmount(100n, 'PER_HOUR', 1)).toBe(2n);
    expect(calculateAmount(100n, 'PER_HOUR', 29)).toBe(48n);
  });

  it('rejects invalid rates and missing hourly duration', () => {
    expect(() => calculateAmount(0n, 'PER_SESSION')).toThrow();
    expect(() => calculateAmount(-1n, 'PER_SESSION')).toThrow();
    expect(() => calculateAmount(100n, 'PER_HOUR')).toThrow();
  });
});
