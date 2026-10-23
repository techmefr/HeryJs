import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { MailDriver, MailMessage } from '@heryjs/core/drivers';
import { smtpMailEnv } from './smtp-mail.env';

const CONNECTION_TIMEOUT_MS = 10_000;

/**
 * SMTP through nodemailer. Unlike Resend this is not one request: the dialogue
 * (EHLO, STARTTLS, AUTH, MAIL FROM, RCPT TO, DATA) has enough corners that
 * hand-writing it would be the part of this driver most likely to be wrong.
 *
 * A transport is opened and closed per message rather than pooled. Every send
 * is already a queued job, so the connection is not on a request's path, and a
 * pool would hold a socket open on a long-lived worker whose credentials may
 * have rotated underneath it.
 */
@Injectable()
export class SmtpMailDriver implements MailDriver {
  async send(message: MailMessage): Promise<void> {
    const env = smtpMailEnv();

    // A user without a password, or the reverse, is a half-written
    // credential. Sending without it would hand the server an anonymous
    // session and surface as an opaque relay refusal, so it stops here.
    if (Boolean(env.MAIL_SMTP_USER) !== Boolean(env.MAIL_SMTP_PASSWORD)) {
      throw new Error(
        'MAIL_SMTP_USER and MAIL_SMTP_PASSWORD must be set together, or both left unset.',
      );
    }

    const transport = createTransport({
      host: env.MAIL_SMTP_HOST,
      port: env.MAIL_SMTP_PORT,
      secure: env.MAIL_SMTP_TLS === 'implicit',
      requireTLS: env.MAIL_SMTP_TLS === 'starttls',
      ignoreTLS: env.MAIL_SMTP_TLS === 'none',
      auth:
        env.MAIL_SMTP_USER && env.MAIL_SMTP_PASSWORD
          ? { user: env.MAIL_SMTP_USER, pass: env.MAIL_SMTP_PASSWORD }
          : undefined,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: CONNECTION_TIMEOUT_MS,
    });

    try {
      const result = await transport.sendMail({
        from: env.MAIL_SMTP_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
      });

      // Thrown, not logged, for the same reason as every driver: a throw is
      // what flips the MailLog row to "failed" and lets BullMQ see the job as
      // failed. nodemailer only rejects when every recipient is refused, so a
      // refusal of the one recipient this contract carries is checked here.
      if (result.rejected.length > 0) {
        throw new Error(
          `The SMTP server refused the recipient: ${result.response}`,
        );
      }
    } finally {
      transport.close();
    }
  }
}
