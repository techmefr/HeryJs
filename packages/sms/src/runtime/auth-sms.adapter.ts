import { Injectable } from '@nestjs/common';
import { AUTH_SMS_SENDER, type AuthSmsSender } from '@heryjs/core/auth';
import type { SmsMessage } from '@heryjs/core/drivers';
import { SmsService } from './sms.service';

/**
 * A sign-in code is transactional by nature: the recipient just asked for it,
 * so it needs no marketing consent. Kernel auth reaches this through the
 * AUTH_SMS_SENDER token and never imports the module.
 */
@Injectable()
export class AuthSmsAdapter implements AuthSmsSender {
  constructor(private readonly sms: SmsService) {}

  async send(message: SmsMessage): Promise<void> {
    await this.sms.sendMessage(message, { kind: 'transactional' });
  }
}

export const AUTH_SMS_SENDER_PROVIDER = {
  provide: AUTH_SMS_SENDER,
  useClass: AuthSmsAdapter,
};
