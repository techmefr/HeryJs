import {
  isValidTimezone,
  isWithinWindow,
  localHour,
  localMinutesOfDay,
  parseTimeOfDay,
} from './local-time';

describe('local time', () => {
  it('recognises real timezones and rejects invented ones', () => {
    expect(isValidTimezone('Europe/Paris')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });

  it('parses HH:mm and nothing else', () => {
    expect(parseTimeOfDay('07:30')).toBe(450);
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('7:30')).toBeNull();
    expect(parseTimeOfDay('07:60')).toBeNull();
  });

  it('reads the wall clock of the given zone, daylight saving included', () => {
    const summer = new Date('2026-07-01T12:00:00Z');
    const winter = new Date('2026-01-01T12:00:00Z');

    expect(localMinutesOfDay('Europe/Paris', summer)).toBe(14 * 60);
    expect(localMinutesOfDay('Europe/Paris', winter)).toBe(13 * 60);
    expect(localHour('Asia/Tokyo', winter)).toBe(21);
    expect(localHour('America/New_York', winter)).toBe(7);
  });

  it('falls back to UTC for a zone that no longer resolves', () => {
    expect(localHour('Mars/Olympus', new Date('2026-01-01T05:00:00Z'))).toBe(5);
  });

  it('handles a window inside a day, across midnight, and an empty one', () => {
    const at = (hhmm: string) => new Date(`2026-10-21T${hhmm}:00Z`);

    expect(isWithinWindow('09:00', '17:00', 'UTC', at('09:00'))).toBe(true);
    expect(isWithinWindow('09:00', '17:00', 'UTC', at('17:00'))).toBe(false);
    expect(isWithinWindow('22:00', '07:00', 'UTC', at('23:30'))).toBe(true);
    expect(isWithinWindow('22:00', '07:00', 'UTC', at('06:59'))).toBe(true);
    expect(isWithinWindow('22:00', '07:00', 'UTC', at('07:00'))).toBe(false);
    expect(isWithinWindow('22:00', '22:00', 'UTC', at('22:00'))).toBe(false);
    expect(isWithinWindow(null, null, 'UTC', at('22:00'))).toBe(false);
  });
});
