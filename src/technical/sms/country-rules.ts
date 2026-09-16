/**
 * The part of SMS that is not a wrapper around a provider.
 *
 * A provider will happily accept a message that a carrier then drops, a
 * regulator fines you for, or a recipient receives at four in the morning.
 * None of that comes back as an API error: the send succeeds, and the failure
 * surfaces weeks later as a deliverability problem nobody can trace. So the
 * rules live here, in front of the driver, and a refusal is loud.
 *
 * Deliberately a small table of the rules that actually bite, not a
 * telecommunications compliance engine. Each entry is a decision a project
 * would otherwise discover the hard way.
 */
export interface CountrySmsRules {
  /** ISO 3166-1 alpha-2. */
  readonly country: string;
  /** E.164 calling code, without the plus. */
  readonly callingCode: string;
  /**
   * Whether a short name may replace the sending number. Where it is refused,
   * a message sent with one is dropped by the carrier rather than rejected by
   * the API.
   */
  readonly alphanumericSenderAllowed: boolean;
  /**
   * Local hours, inclusive start and exclusive end, during which marketing may
   * be sent. Transactional messages are exempt everywhere this applies, which
   * is why the caller states which kind it is sending.
   */
  readonly marketingWindow?: { from: number; to: number };
  /** Whether an opt-out mention has to appear in the body of a marketing SMS. */
  readonly optOutMentionRequired: boolean;
}

/**
 * Four countries rather than two hundred, because a table nobody maintains is
 * worse than an explicit gap: an unknown country falls through to
 * DEFAULT_RULES, which forbids what is most often forbidden and says so.
 */
export const COUNTRY_SMS_RULES: readonly CountrySmsRules[] = [
  {
    country: 'FR',
    callingCode: '33',
    alphanumericSenderAllowed: true,
    // Set by the DGCCRF: no marketing before 8am, after 10pm, on Sundays or
    // public holidays. The days are the caller's to honour; the hours are
    // what this table can check.
    marketingWindow: { from: 8, to: 22 },
    optOutMentionRequired: true,
  },
  {
    country: 'BE',
    callingCode: '32',
    alphanumericSenderAllowed: true,
    marketingWindow: { from: 8, to: 22 },
    optOutMentionRequired: true,
  },
  {
    country: 'US',
    callingCode: '1',
    // Refused: a US long code or short code must be a real number, and an
    // alphanumericated sender is dropped by the carrier without an error.
    alphanumericSenderAllowed: false,
    // TCPA: 8am to 9pm in the recipient's own time zone, which is not
    // something a country code can tell you. The window is the narrower
    // reading, and the comment is the honest part.
    marketingWindow: { from: 8, to: 21 },
    optOutMentionRequired: true,
  },
  {
    country: 'GB',
    callingCode: '44',
    alphanumericSenderAllowed: true,
    optOutMentionRequired: true,
  },
];

/**
 * What an unlisted country gets. It forbids the alphanumeric sender and
 * requires the opt-out mention, because those are the two that are refused in
 * more places than they are allowed -- a default that fails closed is the only
 * honest one for a table this incomplete.
 */
export const DEFAULT_SMS_RULES: Omit<
  CountrySmsRules,
  'country' | 'callingCode'
> = {
  alphanumericSenderAllowed: false,
  optOutMentionRequired: true,
};

/**
 * Longest calling code wins: '1' matches every North American number, and a
 * shorter prefix would claim numbers belonging to a longer one.
 */
export function rulesFor(e164: string): CountrySmsRules | null {
  const digits = e164.startsWith('+') ? e164.slice(1) : e164;

  return (
    [...COUNTRY_SMS_RULES]
      .sort((a, b) => b.callingCode.length - a.callingCode.length)
      .find((rules) => digits.startsWith(rules.callingCode)) ?? null
  );
}

export function rulesOrDefault(
  e164: string,
): Omit<CountrySmsRules, 'country' | 'callingCode'> {
  return rulesFor(e164) ?? DEFAULT_SMS_RULES;
}

/**
 * E.164 is at most fifteen digits including the country code, and at least
 * enough to carry one. Checked here rather than left to the provider because a
 * provider's rejection arrives per message, asynchronously, long after the
 * caller that built it has gone.
 */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value);
}
