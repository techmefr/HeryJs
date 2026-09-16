import type { Mailable, MailMessage } from '#technical/mail/mail-driver';

/**
 * Auth expresses what it needs sent as mailables, exactly like anything
 * `hery make:mail` generates, so the transport stays a runtime decision and
 * these two messages are testable without a mail driver at all.
 *
 * The link is taken from Better Auth rather than rebuilt from an app URL: the
 * token is minted with the callback and only the URL Better Auth hands over is
 * guaranteed to carry it in the shape its own verification route expects.
 */
export class VerifyEmailMailable implements Mailable {
  constructor(
    readonly to: string,
    private readonly url: string,
  ) {}

  build(): MailMessage {
    return {
      to: this.to,
      subject: 'Verify your email address',
      html: `<p>Confirm this address to finish setting up your account.</p><p><a href="${this.url}">Verify my email</a></p>`,
    };
  }
}

export class ResetPasswordMailable implements Mailable {
  constructor(
    readonly to: string,
    private readonly url: string,
  ) {}

  build(): MailMessage {
    return {
      to: this.to,
      subject: 'Reset your password',
      html: `<p>Someone asked to reset the password for this account. If that was not you, ignore this message.</p><p><a href="${this.url}">Choose a new password</a></p>`,
    };
  }
}
