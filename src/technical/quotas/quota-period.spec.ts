import { periodKey } from './quota-period';

describe('periodKey', () => {
  const now = new Date('2026-10-21T23:59:59.000Z');

  it('keys a month by its UTC year and month', () => {
    expect(periodKey('month', now)).toBe('2026-10');
  });

  it('keys a day by its UTC date', () => {
    expect(periodKey('day', now)).toBe('2026-10-21');
  });

  it('never rolls a total over', () => {
    expect(periodKey('total', now)).toBe('total');
    expect(periodKey('total', new Date('2030-01-01T00:00:00.000Z'))).toBe(
      'total',
    );
  });

  it('starts a new month at the UTC instant, whatever the local zone says', () => {
    expect(periodKey('month', new Date('2026-11-01T00:00:00.000Z'))).toBe(
      '2026-11',
    );
    expect(periodKey('month', new Date('2026-10-31T23:59:59.999Z'))).toBe(
      '2026-10',
    );
  });
});
