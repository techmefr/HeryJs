import { HttpStatus } from '@nestjs/common';
import { DomainException } from '#kernel/errors/domain.exception';
import { isE164, rulesOrDefault } from '#kernel/sms/country-rules';
import type { SmsMessage } from '#kernel/sms/sms-driver';

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

export class SmsRefusedException extends DomainException {
  constructor(reason: string, details: Record<string, unknown> = {}) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'sms.refused',
      reason,
      details,
      'sms.refused',
    );
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
    throw new SmsRefusedException(
      `"${message.to}" is not an E.164 number. A national number names no country, and every rule below is chosen by country.`,
      { to: message.to },
    );
  }

  const rules = rulesOrDefault(message.to);

  if (message.sender && !rules.alphanumericSenderAllowed) {
    throw new SmsRefusedException(
      'This country refuses an alphanumeric sender: the carrier drops the message rather than returning an error, so it would look delivered and never arrive.',
      { to: message.to, sender: message.sender },
    );
  }

  if (context.kind === 'transactional') {
    return;
  }

  if (!context.hasConsent) {
    throw new SmsRefusedException(
      'No consent is recorded for this number. Absence of a record is absence of consent, not permission.',
      { to: message.to },
    );
  }

  if (rules.optOutMentionRequired && !mentionsOptOut(message.body)) {
    throw new SmsRefusedException(
      'A marketing message to this country must carry an opt-out mention in its body.',
      { to: message.to },
    );
  }

  if (rules.marketingWindow && context.localHour !== undefined) {
    const { from, to } = rules.marketingWindow;

    if (context.localHour < from || context.localHour >= to) {
      throw new SmsRefusedException(
        `Marketing to this country is allowed between ${from}:00 and ${to}:00 local time, and it is ${context.localHour}:00 there.`,
        { to: message.to, localHour: context.localHour },
      );
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
