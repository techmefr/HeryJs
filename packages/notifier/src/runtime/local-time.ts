import { DEFAULT_TIMEZONE } from './notification-rules';

const MINUTES_PER_HOUR = 60;
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone });

    return true;
  } catch {
    return false;
  }
}

export function parseTimeOfDay(value: string): number | null {
  const match = TIME_OF_DAY.exec(value);

  if (!match) {
    return null;
  }

  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

export function localMinutesOfDay(timezone: string, now: Date): number {
  const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === 'minute')?.value ?? 0,
  );

  return hour * MINUTES_PER_HOUR + minute;
}

export function localHour(timezone: string, now: Date): number {
  return Math.floor(localMinutesOfDay(timezone, now) / MINUTES_PER_HOUR);
}

export function isWithinWindow(
  start: string | null,
  end: string | null,
  timezone: string,
  now: Date,
): boolean {
  if (start === null || end === null) {
    return false;
  }

  const from = parseTimeOfDay(start);
  const to = parseTimeOfDay(end);

  if (from === null || to === null || from === to) {
    return false;
  }

  const current = localMinutesOfDay(timezone, now);

  return from < to
    ? current >= from && current < to
    : current >= from || current < to;
}
