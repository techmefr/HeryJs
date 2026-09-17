import { Injectable, Logger } from '@nestjs/common';
import type { SmsDriver, SmsMessage } from '#kernel/sms/sms-driver';

/**
 * The zero-config default, and the counterpart of mail's log driver: it
 * implements the whole contract and writes to the logger instead of reaching a
 * provider. A freshly generated app therefore cannot text a real phone, and an
 * SMS to a wrong number is not a mistake anyone can take back.
 */
@Injectable()
export class LogSmsDriver implements SmsDriver {
  private readonly logger = new Logger('Sms');

  send(message: SmsMessage): Promise<void> {
    this.logger.log(
      `to=${message.to}${message.sender ? ` from=${message.sender}` : ''} body="${message.body}"`,
    );
    return Promise.resolve();
  }
}
