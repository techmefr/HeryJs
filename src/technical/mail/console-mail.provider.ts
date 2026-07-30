import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailProvider } from './mail.types';

// Safe zero-config default: logs instead of sending, so a freshly generated
// app never accidentally emails anyone. Swap MAIL_PROVIDER for a real SMTP
// or API-based provider later without touching MailService or its callers.
@Injectable()
export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  send(message: MailMessage): Promise<void> {
    this.logger.log(`to=${message.to} subject="${message.subject}"`);
    return Promise.resolve();
  }
}
