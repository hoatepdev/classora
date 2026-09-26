const ATTENDED = new Set(['PRESENT', 'LATE', 'ONLINE', 'MAKEUP']);
const ABSENT = new Set(['ABSENT_EXCUSED', 'ABSENT_UNEXCUSED']);

export function attendanceSummary(statuses: string[]) {
  const attended = statuses.filter((status) => ATTENDED.has(status)).length;
  const absent = statuses.filter((status) => ABSENT.has(status)).length;
  const late = statuses.filter((status) => status === 'LATE').length;
  const total = attended + absent;
  return { attended, absent, late, total, percentage: total ? Math.round(attended * 10000 / total) / 100 : null };
}
