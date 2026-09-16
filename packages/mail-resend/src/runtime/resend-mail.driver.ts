import { Injectable } from '@nestjs/common';
import type { MailDriver, MailMessage } from '#kernel/mail/mail-driver';
import { resendMailEnv } from './resend-mail.env';

const ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend over `fetch`, with no SDK dependency on purpose: the whole transport
 * is one POST, and a package that adds nothing but a typed wrapper around it
 * would still have to be installed, audited and upgraded by every project that
 * only wanted to send mail.
 */
@Injectable()
export class ResendMailDriver implements MailDriver {
  async send(message: MailMessage): Promise<void> {
    const env = resendMailEnv();

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
      }),
    });

    // Thrown, not logged: the caller is the mail processor, and a throw is
    // what flips the MailLog row to "failed" and lets BullMQ see the job as
    // failed. Swallowing it here would record a message as sent that Resend
    // rejected.
    if (!response.ok) {
      throw new Error(
        `Resend refused the message (${response.status}): ${await response.text()}`,
      );
    }
  }
}
