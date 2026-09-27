const ZONE = 'Asia/Ho_Chi_Minh';
const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function partsOf(value: Date) {
  return Object.fromEntries(PARTS.formatToParts(value).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
}

function zonedMidnight(year: string, month: string, day: string) {
  const approximate = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const shown = partsOf(approximate);
  const offsetMinutes = (Number(shown.hour) * 60 + Number(shown.minute)) - (approximate.getUTCHours() * 60 + approximate.getUTCMinutes());
  return new Date(approximate.getTime() - offsetMinutes * 60_000);
}

export type DashboardBusinessClock = {
  now: Date;
  businessDate: string;
  localDayStart: Date;
  localDayEnd: Date;
  localMonthStart: Date;
  localMonthEnd: Date;
};

// Vietnam-local business clock. All dashboard sections derive "today", "this
// month", and overdue boundaries from one snapshot of this clock so no two
// sections can disagree, and no query depends on the database session timezone.
// Asia/Ho_Chi_Minh has no DST, so local midnights are exactly 24h apart.
export function dashboardBusinessClock(now = new Date()): DashboardBusinessClock {
  const parts = partsOf(now);
  const businessDate = `${parts.year}-${parts.month}-${parts.day}`;
  const localDayStart = zonedMidnight(parts.year, parts.month, parts.day);
  const localMonthStart = zonedMidnight(parts.year, parts.month, '01');
  const monthAfter = new Date(`${parts.year}-${parts.month}-01T00:00:00Z`);
  monthAfter.setUTCMonth(monthAfter.getUTCMonth() + 1);
  const nextMonthParts = partsOf(monthAfter);
  return {
    now,
    businessDate,
    localDayStart,
    localDayEnd: new Date(localDayStart.getTime() + 24 * 60 * 60_000),
    localMonthStart,
    localMonthEnd: zonedMidnight(nextMonthParts.year, nextMonthParts.month, '01'),
  };
}

export function hcmDate(value: Date | string) {
  const parts = partsOf(new Date(value));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
