import {
  DEFAULT_SMS_RULES,
  isE164,
  rulesFor,
  rulesOrDefault,
} from './country-rules';

describe('E.164 validation', () => {
  it('accepts a full international number', () => {
    expect(isE164('+33612345678')).toBe(true);
  });

  /**
   * The rule the whole table depends on: a number stored nationally is one
   * whose country nothing can tell, and every rule below is chosen by country.
   * Accepting `0612345678` would mean guessing, which is how a French number
   * becomes an Italian one.
   */
  it('refuses a national number, which names no country', () => {
    expect(isE164('0612345678')).toBe(false);
  });

  it('refuses a number whose country code starts with zero', () => {
    expect(isE164('+0612345678')).toBe(false);
  });

  it('refuses anything longer than E.164 allows', () => {
    expect(isE164(`+${'1'.repeat(16)}`)).toBe(false);
  });
});

describe('country rules', () => {
  it('matches a number to its country', () => {
    expect(rulesFor('+33612345678')?.country).toBe('FR');
    expect(rulesFor('+15551234567')?.country).toBe('US');
  });

  // '1' is a prefix of nothing else here, but '33' and '3' would collide the
  // moment a one-digit code is added -- so the longest code wins by
  // construction rather than by luck of ordering.
  it('prefers the longest matching calling code', () => {
    expect(rulesFor('+44771234567')?.country).toBe('GB');
    expect(rulesFor('+32470123456')?.country).toBe('BE');
  });

  it('knows it does not know every country', () => {
    expect(rulesFor('+819012345678')).toBeNull();
  });

  /**
   * A table covering four countries has to fail closed: the two rules that are
   * refused in more places than they are allowed are the two an unlisted
   * country gets.
   */
  it('falls back to the strict default rather than to permission', () => {
    const rules = rulesOrDefault('+819012345678');

    expect(rules).toEqual(DEFAULT_SMS_RULES);
    expect(rules.alphanumericSenderAllowed).toBe(false);
    expect(rules.optOutMentionRequired).toBe(true);
  });

  it('refuses an alphanumeric sender where the carrier would drop it', () => {
    expect(rulesFor('+15551234567')?.alphanumericSenderAllowed).toBe(false);
    expect(rulesFor('+33612345678')?.alphanumericSenderAllowed).toBe(true);
  });

  it('carries the marketing window where one applies', () => {
    expect(rulesFor('+33612345678')?.marketingWindow).toEqual({
      from: 8,
      to: 22,
    });
    expect(rulesFor('+44771234567')?.marketingWindow).toBeUndefined();
  });
});
