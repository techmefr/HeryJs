import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#technical/public/errors';
import {
  isE164,
  rulesOrDefault,
  type SmsMessage,
} from '#technical/public/drivers';

/**
 * Transactional messages answer something the recipient did -- a code, a
 * receipt, a delivery. Marketing is everything else, and it is the only kind
 * the sending windows, the opt-out mention and consent apply to.
 *
 * The caller states which it is because nothing else can tell: the same body
 * can be either depending on why it was sent, and guessing wrong in the
 * permissive direction is the expensive mistake.
 */
export type SmsKind = 'transactional' | 'marketing';

export type SmsRefusalReason =
  | 'not-e164'
  | 'alphanumeric-sender'
  | 'no-consent'
  | 'opt-out-missing'
  | 'outside-window';

export type SmsRefusalDetails = Record<string, unknown> & { to: string };

const MESSAGE_BY_REASON: Record<
  SmsRefusalReason,
  (details: SmsRefusalDetails) => string
> = {
  'not-e164': (details) =>
    `"${details.to}" is not an E.164 number. A national number names no country, and every rule below is chosen by country.`,
  'alphanumeric-sender': () =>
    'This country refuses an alphanumeric sender: the carrier drops the message rather than returning an error, so it would look delivered and never arrive.',
  'no-consent': () =>
    'No consent is recorded for this number. Absence of a record is absence of consent, not permission.',
  'opt-out-missing': () =>
    'A marketing message to this country must carry an opt-out mention in its body.',
  'outside-window': (details) =>
    `Marketing to this country is allowed between ${String(details.from)}:00 and ${String(details.until)}:00 local time, and it is ${String(details.localHour)}:00 there.`,
};

export class SmsRefusedException extends DomainException {
  readonly reason: SmsRefusalReason;

  constructor(reason: SmsRefusalReason, details: SmsRefusalDetails) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'sms.refused',
      MESSAGE_BY_REASON[reason](details),
      { ...details, reason },
      'sms.refused',
    );
    this.reason = reason;
  }
}

export interface SmsGuardContext {
  kind: SmsKind;
  /** Local hour at the recipient, 0-23. Absent skips the window check. */
  localHour?: number;
  hasConsent: boolean;
}

/**
 * Everything a provider will accept and a carrier, a regulator or a recipient
 * will not. None of it comes back as an API error -- the send succeeds and the
 * damage surfaces weeks later -- so it is refused here, loudly, before the
 * driver sees it.
 */
export function assertSendable(
  message: SmsMessage,
  context: SmsGuardContext,
): void {
  if (!isE164(message.to)) {
    throw new SmsRefusedException('not-e164', { to: message.to });
  }

  const rules = rulesOrDefault(message.to);

  if (message.sender && !rules.alphanumericSenderAllowed) {
    throw new SmsRefusedException('alphanumeric-sender', {
      to: message.to,
      sender: message.sender,
    });
  }

  if (context.kind === 'transactional') {
    return;
  }

  if (!context.hasConsent) {
    throw new SmsRefusedException('no-consent', { to: message.to });
  }

  if (rules.optOutMentionRequired && !mentionsOptOut(message.body)) {
    throw new SmsRefusedException('opt-out-missing', { to: message.to });
  }

  if (rules.marketingWindow && context.localHour !== undefined) {
    const { from, to } = rules.marketingWindow;

    if (context.localHour < from || context.localHour >= to) {
      throw new SmsRefusedException('outside-window', {
        to: message.to,
        localHour: context.localHour,
        from,
        until: to,
      });
    }
  }
}

/**
 * Deliberately a loose match over several languages rather than a required
 * exact string: an implementation that demands one wording is one every
 * project works around by appending it twice.
 */
function mentionsOptOut(body: string): boolean {
  return /\b(stop|unsubscribe|désinscription|desinscription|opt[- ]?out)\b/i.test(
    body,
  );
}
