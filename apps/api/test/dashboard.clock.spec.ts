import { describe, expect, it } from 'vitest';
import { dashboardBusinessClock, hcmDate } from '../src/dashboard/business-clock.js';

describe('dashboard business clock', () => {
  it('derives the Vietnam business date from UTC instants', () => {
    expect(dashboardBusinessClock(new Date('2026-09-27T10:00:00Z')).businessDate).toBe('2026-09-27');
    expect(dashboardBusinessClock(new Date('2026-09-27T17:00:00Z')).businessDate).toBe('2026-09-28');
    expect(dashboardBusinessClock(new Date('2026-09-27T16:59:59Z')).businessDate).toBe('2026-09-27');
  });

  it('computes local day bounds as UTC+7 instants', () => {
    const clock = dashboardBusinessClock(new Date('2026-09-27T10:00:00Z'));
    expect(clock.localDayStart.toISOString()).toBe('2026-09-26T17:00:00.000Z');
    expect(clock.localDayEnd.toISOString()).toBe('2026-09-27T17:00:00.000Z');
  });

  it('crosses month boundaries in Vietnam-local time', () => {
    const clock = dashboardBusinessClock(new Date('2026-09-30T18:30:00Z'));
    expect(clock.businessDate).toBe('2026-10-01');
    expect(clock.localMonthStart.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(clock.localMonthEnd.toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });

  it('keeps month bounds inside the same local month', () => {
    const clock = dashboardBusinessClock(new Date('2026-02-14T03:00:00Z'));
    expect(clock.localMonthStart.toISOString()).toBe('2026-01-31T17:00:00.000Z');
    expect(clock.localMonthEnd.toISOString()).toBe('2026-02-28T17:00:00.000Z');
  });

  it('formats instants as Vietnam-local dates', () => {
    expect(hcmDate(new Date('2026-09-27T17:00:00Z'))).toBe('2026-09-28');
    expect(hcmDate('2026-09-27T05:00:00.000Z')).toBe('2026-09-27');
  });
});
