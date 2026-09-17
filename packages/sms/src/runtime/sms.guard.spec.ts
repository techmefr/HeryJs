import { assertSendable, SmsRefusedException } from './sms.guard';
import type { SmsGuardContext } from './sms.guard';

const marketing: SmsGuardContext = {
  kind: 'marketing',
  hasConsent: true,
  localHour: 10,
};
const transactional: SmsGuardContext = {
  kind: 'transactional',
  hasConsent: false,
};

function send(
  to: string,
  body = 'Sale on now. Reply STOP to unsubscribe.',
  context: SmsGuardContext = marketing,
  sender?: string,
) {
  return () => assertSendable({ to, body, sender }, context);
}

describe('assertSendable', () => {
  it('refuses a national number, which names no country', () => {
    expect(send('0612345678')).toThrow(SmsRefusedException);
  });

  /**
   * The carrier drops it rather than returning an error, so the message looks
   * delivered and never arrives -- the failure mode that costs a week to
   * diagnose because nothing anywhere reports it.
   */
  it('refuses an alphanumeric sender where the carrier would drop it', () => {
    expect(
      send('+15551234567', 'Sale. Reply STOP.', marketing, 'ACME'),
    ).toThrow(/alphanumeric sender/);
  });

  it('allows an alphanumeric sender where it is legal', () => {
    expect(
      send('+33612345678', 'Soldes. STOP au 36111.', marketing, 'ACME'),
    ).not.toThrow();
  });

  // Absence of a record is absence of consent. `?? true` is the reading that
  // ends in a fine, and it is the one a hand-rolled check falls into.
  it('refuses marketing with no consent recorded', () => {
    expect(
      send('+33612345678', 'Soldes. STOP au 36111.', {
        ...marketing,
        hasConsent: false,
      }),
    ).toThrow(/No consent is recorded/);
  });

  it('lets a transactional message through without consent', () => {
    expect(
      send('+33612345678', 'Your code is 123456', transactional),
    ).not.toThrow();
  });

  it('refuses marketing with no opt-out mention', () => {
    expect(send('+33612345678', 'Soldes cette semaine')).toThrow(/opt-out/);
  });

  it('accepts an opt-out mention in either language', () => {
    expect(send('+33612345678', 'Soldes. Désinscription ici.')).not.toThrow();
    expect(send('+33612345678', 'Sale. Reply STOP.')).not.toThrow();
  });

  it('refuses marketing outside the local sending window', () => {
    expect(
      send('+33612345678', 'Soldes. STOP au 36111.', {
        ...marketing,
        localHour: 7,
      }),
    ).toThrow(/between 8:00 and 22:00/);
    expect(
      send('+33612345678', 'Soldes. STOP au 36111.', {
        ...marketing,
        localHour: 22,
      }),
    ).toThrow(/between 8:00 and 22:00/);
  });

  it('sends transactional at any hour, which is the point of the distinction', () => {
    expect(
      send('+33612345678', 'Your code is 123456', {
        ...transactional,
        localHour: 4,
      }),
    ).not.toThrow();
  });

  // An unlisted country falls through to the strict default, so a sender that
  // is fine in France is refused for a country the table has never heard of.
  it('applies the strict default to an unlisted country', () => {
    expect(
      send('+819012345678', 'Sale. Reply STOP.', marketing, 'ACME'),
    ).toThrow(/alphanumeric sender/);
  });

  it('skips the window check when the local hour is unknown', () => {
    expect(
      send('+33612345678', 'Soldes. STOP au 36111.', {
        kind: 'marketing',
        hasConsent: true,
      }),
    ).not.toThrow();
  });
});
