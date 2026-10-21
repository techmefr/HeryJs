import type { SmsMessage } from '#technical/sms/sms-driver';
import { EmailOtpMailable, MagicLinkMailable } from './auth.mailables';
import { sendAuthSms, setAuthSmsSender } from './auth-sms';
import { isE164, otpSmsBody, phoneTempEmail } from './passwordless-plugins';

describe('passwordless mailables', () => {
  it('puts the link Better Auth minted into the magic link email', async () => {
    const mailable = new MagicLinkMailable(
      'user@example.com',
      'https://app.test/api/auth/magic-link/verify?token=abc',
    );
    const message = await Promise.resolve(mailable.build());

    expect(message.to).toBe('user@example.com');
    expect(message.subject).toBe('Your sign-in link');
    expect(message.html).toContain('magic-link/verify?token=abc');
  });

  it('puts the code in the email and names what it is for', async () => {
    const signIn = await Promise.resolve(
      new EmailOtpMailable('user@example.com', '123456', 'sign-in').build(),
    );
    const reset = await Promise.resolve(
      new EmailOtpMailable(
        'user@example.com',
        '654321',
        'forget-password',
      ).build(),
    );

    expect(signIn.subject).toBe('Your sign-in code');
    expect(signIn.html).toContain('123456');
    expect(reset.subject).toBe('Your password reset code');
    expect(reset.html).toContain('654321');
  });
});

describe('sendAuthSms', () => {
  afterEach(() => {
    setAuthSmsSender(null);
  });

  it('hands the message to whatever is bound to the token', async () => {
    const sent: SmsMessage[] = [];
    setAuthSmsSender({
      send: (message: SmsMessage): Promise<void> => {
        sent.push(message);
        return Promise.resolve();
      },
    });

    await sendAuthSms({ to: '+33612345678', body: otpSmsBody('123456') });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('+33612345678');
    expect(sent[0]?.body).toContain('123456');
  });

  it('drops the message instead of throwing when no sms module is installed', async () => {
    await expect(
      sendAuthSms({ to: '+33612345678', body: 'x' }),
    ).resolves.toBeUndefined();
  });
});

describe('phone number helpers', () => {
  it('accepts E.164 and nothing else', () => {
    expect(isE164('+33612345678')).toBe(true);
    expect(isE164('+14155550100')).toBe(true);
    expect(isE164('0612345678')).toBe(false);
    expect(isE164('+0612345678')).toBe(false);
    expect(isE164('+33 6 12 34 56 78')).toBe(false);
    expect(isE164('+1')).toBe(false);
  });

  it('derives a stable placeholder email for a phone-only account', () => {
    expect(phoneTempEmail('+33612345678')).toBe(
      '33612345678@phone.heryjs.local',
    );
  });
});
