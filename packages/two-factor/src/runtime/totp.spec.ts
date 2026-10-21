import {
  base32Decode,
  base32Encode,
  hotp,
  matchStep,
  otpauthUrl,
  stepAt,
} from './totp';

const RFC_SECRET = Buffer.from('12345678901234567890');
const EIGHT_DIGITS = 8;
const SECONDS = 1000;

const RFC_6238_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('totp', () => {
  it.each(RFC_6238_VECTORS)(
    'matches the RFC 6238 SHA-1 vector at t=%i',
    (seconds, expected) => {
      expect(hotp(RFC_SECRET, stepAt(seconds * SECONDS), EIGHT_DIGITS)).toBe(
        expected,
      );
    },
  );

  it('matches the RFC 4226 counter vectors', () => {
    expect(hotp(RFC_SECRET, 0)).toBe('755224');
    expect(hotp(RFC_SECRET, 1)).toBe('287082');
    expect(hotp(RFC_SECRET, 9)).toBe('520489');
  });

  it('round-trips base32 and reads the RFC secret', () => {
    expect(base32Encode(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toEqual(
      RFC_SECRET,
    );
    expect(base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq')).toEqual(
      RFC_SECRET,
    );
  });

  it('refuses a character outside the base32 alphabet', () => {
    expect(() => base32Decode('GEZ1')).toThrow();
  });

  describe('matchStep', () => {
    const nowMs = 1111111111 * SECONDS;
    const current = stepAt(nowMs);

    it('accepts the current code and reports its step', () => {
      expect(matchStep(RFC_SECRET, hotp(RFC_SECRET, current), nowMs, 1)).toBe(
        current,
      );
    });

    it('accepts one step of clock drift either way, and no more', () => {
      expect(
        matchStep(RFC_SECRET, hotp(RFC_SECRET, current - 1), nowMs, 1),
      ).toBe(current - 1);
      expect(
        matchStep(RFC_SECRET, hotp(RFC_SECRET, current + 1), nowMs, 1),
      ).toBe(current + 1);
      expect(
        matchStep(RFC_SECRET, hotp(RFC_SECRET, current - 2), nowMs, 1),
      ).toBeNull();
      expect(
        matchStep(RFC_SECRET, hotp(RFC_SECRET, current + 2), nowMs, 1),
      ).toBeNull();
    });

    it('accepts only the current step with a zero window', () => {
      expect(
        matchStep(RFC_SECRET, hotp(RFC_SECRET, current - 1), nowMs, 0),
      ).toBeNull();
    });

    it('refuses anything that is not six digits', () => {
      expect(matchStep(RFC_SECRET, '12345', nowMs, 1)).toBeNull();
      expect(matchStep(RFC_SECRET, '1234567', nowMs, 1)).toBeNull();
      expect(matchStep(RFC_SECRET, 'abcdef', nowMs, 1)).toBeNull();
      expect(matchStep(RFC_SECRET, '', nowMs, 1)).toBeNull();
    });
  });

  it('builds an otpauth url an authenticator app can read', () => {
    const url = new URL(otpauthUrl('Hery Js', 'a+b@example.test', 'ABCDEF'));

    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/Hery Js:a+b@example.test');
    expect(url.searchParams.get('secret')).toBe('ABCDEF');
    expect(url.searchParams.get('digits')).toBe('6');
    expect(url.searchParams.get('period')).toBe('30');
  });
});
