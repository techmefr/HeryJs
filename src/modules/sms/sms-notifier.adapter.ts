import { Injectable } from '@nestjs/common';
import { NOTIFIER_SMS_CHANNEL } from '#technical/notifier/notifier-sms-channel';
import type { NotifierSmsChannel } from '#technical/notifier/notifier-sms-channel';
import type { SmsMessage } from '#technical/sms/sms-driver';
import { SmsService } from './sms.service';

/**
 * `SmsService.sendMessage` takes a `kind`, because the guard treats
 * transactional and marketing sends differently. A notification is neither --
 * it is triggered by something the recipient did, the same as every channel
 * the notifier composes -- so this fixes `kind: 'transactional'` rather than
 * exposing the choice, and lets the notifier's own consent check (see
 * `#technical/notifier/notifier-sms-channel`) be the one that decides whether the
 * message is sent at all.
 */
@Injectable()
export class SmsNotifierAdapter implements NotifierSmsChannel {
  constructor(private readonly sms: SmsService) {}

  async send(message: SmsMessage): Promise<void> {
    await this.sms.sendMessage(message, { kind: 'transactional' });
  }
}

export const SMS_NOTIFIER_CHANNEL_PROVIDER = {
  provide: NOTIFIER_SMS_CHANNEL,
  useClass: SmsNotifierAdapter,
};
