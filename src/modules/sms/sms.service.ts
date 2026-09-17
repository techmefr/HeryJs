import { Injectable } from '@nestjs/common';
import type { Sendable, SmsMessage } from '#technical/sms/sms-driver';
import { SmsConsentService } from './sms.consent';
import { SmsDriverRegistry } from './sms-driver.registry';
import { assertSendable } from './sms.guard';
import type { SmsKind } from './sms.guard';

export interface SendSmsOptions {
  kind: SmsKind;
  /** Local hour at the recipient, 0-23. Omitted skips the sending-window check. */
  localHour?: number;
}

@Injectable()
export class SmsService {
  constructor(
    private readonly drivers: SmsDriverRegistry,
    private readonly consent: SmsConsentService,
  ) {}

  /**
   * Consent is read here rather than passed in, so a caller cannot assert it
   * by accident -- the whole point of recording it is that the record decides,
   * not the code path that happens to be sending.
   */
  async send(sendable: Sendable, options: SendSmsOptions): Promise<void> {
    const message = await sendable.build();

    await this.sendMessage({ ...message, to: sendable.to }, options);
  }

  async sendMessage(
    message: SmsMessage,
    options: SendSmsOptions,
  ): Promise<void> {
    const decision =
      options.kind === 'marketing'
        ? await this.consent.decisionFor(message.to)
        : { granted: false };

    assertSendable(message, {
      kind: options.kind,
      localHour: options.localHour,
      hasConsent: decision.granted,
    });

    await this.drivers.active.send(message);
  }
}
