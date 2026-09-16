import type { Mailable } from '#technical/mail/mail-driver';
import { sendAuthMail, setAuthMailer } from './auth-mailer';
import { ResetPasswordMailable, VerifyEmailMailable } from './auth.mailables';

describe('auth mailables', () => {
  it('builds the verification mailable from the Better Auth callback data', async () => {
    const mailable = new VerifyEmailMailable(
      'user@example.com',
      'https://app.test/verify?token=abc',
    );
    const message = await Promise.resolve(mailable.build());

    expect(mailable.to).toBe('user@example.com');
    expect(message.to).toBe('user@example.com');
    expect(message.subject).toBe('Verify your email address');
    expect(message.html).toContain('https://app.test/verify?token=abc');
  });

  it('builds the reset mailable from the Better Auth callback data', async () => {
    const mailable = new ResetPasswordMailable(
      'user@example.com',
      'https://app.test/reset?token=xyz',
    );
    const message = await Promise.resolve(mailable.build());

    expect(message.to).toBe('user@example.com');
    expect(message.subject).toBe('Reset your password');
    expect(message.html).toContain('https://app.test/reset?token=xyz');
  });
});

describe('sendAuthMail', () => {
  afterEach(() => {
    setAuthMailer(null);
    jest.restoreAllMocks();
  });

  it('hands the mailable to whatever is bound to the token', async () => {
    const sent: Mailable[] = [];
    setAuthMailer({
      send: (mailable: Mailable): Promise<void> => {
        sent.push(mailable);
        return Promise.resolve();
      },
    });

    const mailable = new VerifyEmailMailable('user@example.com', 'https://x');
    await sendAuthMail(mailable);

    expect(sent).toEqual([mailable]);
  });

  it('drops the email instead of throwing when no mail module is installed', async () => {
    setAuthMailer(null);

    await expect(
      sendAuthMail(new ResetPasswordMailable('user@example.com', 'https://x')),
    ).resolves.toBeUndefined();
  });
});
