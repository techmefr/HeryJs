import { Injectable, Logger } from '@nestjs/common';
import type { MailDriver, MailMessage } from '#kernel/mail/mail-driver';

/**
 * The zero-config default: a real driver that honestly implements the whole
 * contract and happens to write to the logger instead of reaching a vendor.
 * A freshly generated app therefore cannot accidentally email a live person,
 * because the driver it got by default has no way to.
 *
 * It ships inside the module rather than as a package, and the registry holds
 * it by constructor injection rather than resolving it by token, because it is
 * the one driver guaranteed to be present.
 */
@Injectable()
export class LogMailDriver implements MailDriver {
  private readonly logger = new Logger('Mail');

  send(message: MailMessage): Promise<void> {
    this.logger.log(`to=${message.to} subject="${message.subject}"`);
    return Promise.resolve();
  }
}
