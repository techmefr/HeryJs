import { LocaleContextStorage } from '#technical/i18n/locale-context';
import { recipientLocale } from '#technical/i18n/recipient-locale';
import {
  EmailOtpMailable,
  ResetPasswordMailable,
  VerifyEmailMailable,
} from './auth.mailables';

describe('auth mailables', () => {
  it('writes a password reset to a French user in French', () => {
    const mail = new ResetPasswordMailable(
      'ada@example.com',
      'https://app.test/reset?token=t',
      recipientLocale({ locale: 'fr' }),
    ).build();

    expect(mail.subject).toBe('Réinitialisez votre mot de passe');
    expect(mail.html).toContain('Choisir un nouveau mot de passe');
    expect(mail.html).toContain('https://app.test/reset?token=t');
  });

  it("follows the recipient's locale, not the request's", () => {
    const mail = LocaleContextStorage.run('fr', () =>
      new VerifyEmailMailable(
        'bob@example.com',
        'https://app.test/verify',
        recipientLocale({ locale: 'en' }),
      ).build(),
    );

    expect(mail.subject).toBe('Verify your email address');
  });

  it('falls back to the default locale for a user with none', () => {
    expect(recipientLocale({ locale: null })).toBe('en');
    expect(recipientLocale({ locale: 'xx' })).toBe('en');
  });

  it('renders a one-time code in the recipient locale', () => {
    const mail = new EmailOtpMailable(
      'ada@example.com',
      '123456',
      'sign-in',
      'fr',
    ).build();

    expect(mail.subject).toBe('Votre code de connexion');
    expect(mail.html).toContain('<strong>123456</strong>');
  });
});
