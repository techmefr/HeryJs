import { translateMessage } from '#technical/i18n/translate';
import type { Mailable, MailMessage } from '#technical/mail/mail-driver';

/**
 * Auth expresses what it needs sent as mailables, exactly like anything
 * `hery make:mail` generates, so the transport stays a runtime decision and
 * these two messages are testable without a mail driver at all.
 *
 * The link is taken from Better Auth rather than rebuilt from an app URL: the
 * token is minted with the callback and only the URL Better Auth hands over is
 * guaranteed to carry it in the shape its own verification route expects.
 *
 * Each is written in the recipient's locale, which the caller resolves --
 * see `localeOfRecipient` -- rather than in the language of the request.
 */
function linkMail(
  to: string,
  url: string,
  key: string,
  locale: string | undefined,
): MailMessage {
  return {
    to,
    subject: translateMessage(`${key}.subject`, {}, locale),
    html: `<p>${translateMessage(`${key}.body`, {}, locale)}</p><p><a href="${url}">${translateMessage(`${key}.action`, {}, locale)}</a></p>`,
  };
}

export class VerifyEmailMailable implements Mailable {
  constructor(
    readonly to: string,
    private readonly url: string,
    private readonly locale?: string,
  ) {}

  build(): MailMessage {
    return linkMail(this.to, this.url, 'mail.verifyEmail', this.locale);
  }
}

export class ResetPasswordMailable implements Mailable {
  constructor(
    readonly to: string,
    private readonly url: string,
    private readonly locale?: string,
  ) {}

  build(): MailMessage {
    return linkMail(this.to, this.url, 'mail.resetPassword', this.locale);
  }
}

export class MagicLinkMailable implements Mailable {
  constructor(
    readonly to: string,
    private readonly url: string,
    private readonly locale?: string,
  ) {}

  build(): MailMessage {
    return linkMail(this.to, this.url, 'mail.magicLink', this.locale);
  }
}

export type EmailOtpPurpose =
  'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

export class EmailOtpMailable implements Mailable {
  constructor(
    readonly to: string,
    private readonly code: string,
    private readonly purpose: EmailOtpPurpose,
    private readonly locale?: string,
  ) {}

  build(): MailMessage {
    return {
      to: this.to,
      subject: translateMessage(
        `mail.otp.subject.${this.purpose}`,
        {},
        this.locale,
      ),
      html: `<p>${translateMessage('mail.otp.body', { code: this.code }, this.locale)}</p>`,
    };
  }
}
