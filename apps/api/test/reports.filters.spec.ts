import { describe, expect, it } from 'vitest';
import { addDay } from '../src/reports/report-filters.js';

describe('report date boundaries', () => {
  it('uses the day after to for half-open timestamp ranges', () => {
    expect(addDay('2026-09-28', 1)).toBe('2026-09-29');
  });

  it('crosses month, year and leap-day boundaries deterministically', () => {
    expect(addDay('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDay('2028-02-28', 1)).toBe('2028-02-29');
  });
});
