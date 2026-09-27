// API scores are exact scale-2 decimal strings; persisted values are NUMERIC(8,2).
const DECIMAL = /^(\d{1,6})(?:\.(\d{1,2}))?$/;
const SCALE = 100;
export function parseScore(value: string): number | null {
  if (typeof value !== 'string') return null;
  const match = DECIMAL.exec(value);
  if (!match) return null;
  return Number(match[1]) * SCALE + Number((match[2] ?? '').padEnd(2, '0'));
}
export function formatScore(cents: number | null): string | null {
  if (cents === null) return null;
  return `${Math.floor(cents / SCALE)}.${String(cents % SCALE).padStart(2, '0')}`;
}
export function scorePercentage(scoreCents: number, maxScoreCents: number): number {
  if (!Number.isSafeInteger(scoreCents) || !Number.isSafeInteger(maxScoreCents) || maxScoreCents <= 0) throw new RangeError('Invalid score');
  return Math.round((scoreCents * 10_000) / maxScoreCents) / 100;
}
