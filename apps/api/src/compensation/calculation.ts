export type CompensationBasis = 'PER_SESSION' | 'PER_HOUR' | 'FIXED_CLASS';

export function parseTimeMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  if (!match) throw new Error('Invalid SQL time value');
  return Number(match[1]) * 60 + Number(match[2]);
}

export function durationMinutes(startTime: string, endTime: string) {
  const duration = parseTimeMinutes(endTime) - parseTimeMinutes(startTime);
  if (duration <= 0) throw new Error('Session end time must be after start time');
  return duration;
}

export function calculateAmount(rateVnd: bigint, basis: CompensationBasis, minutes?: number) {
  if (rateVnd <= 0n) throw new Error('Compensation rate must be positive');
  if (basis === 'PER_HOUR') {
    if (!minutes || minutes <= 0) throw new Error('Hourly compensation requires duration');
    return (rateVnd * BigInt(minutes) + 30n) / 60n;
  }
  return rateVnd;
}
