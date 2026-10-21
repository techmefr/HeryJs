import { z } from 'zod';
import { parseModuleEnv } from '#kernel/config/module-env';

/**
 * Parsed lazily, as a function rather than a module-level constant, for the
 * same reason the Resend driver does: an app declaring this driver in
 * hery.config.ts but running on `log` in development is not refused boot over
 * a host it will never dial.
 *
 * `MAIL_SMTP_TLS` is one name for the three things a port can mean. `starttls` is
 * the submission default (587) and refuses to send in the clear if the server
 * will not upgrade; `implicit` is a TLS socket from the first byte (465);
 * `none` exists for a local catcher such as Mailpit and is the only setting
 * that can put a credential on the wire unencrypted.
 */
export function smtpMailEnv() {
  return parseModuleEnv('mail-smtp', {
    MAIL_SMTP_HOST: z.string().min(1),
    MAIL_SMTP_PORT: z.coerce.number().int().positive().default(587),
    MAIL_SMTP_TLS: z.enum(['starttls', 'implicit', 'none']).default('starttls'),
    MAIL_SMTP_USER: z.string().min(1).optional(),
    MAIL_SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_SMTP_FROM: z.string().min(1),
  });
}
