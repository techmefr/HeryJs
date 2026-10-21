import type { PrismaClient } from '@prisma/client';
import type { BetterAuthPlugin } from 'better-auth';
import type { AuthEnv } from './auth.env';
import { EmailOtpMailable, MagicLinkMailable } from './auth.mailables';
import { sendAuthMail } from './auth-mailer';
import { sendAuthSms } from './auth-sms';
import { moveGuestOwnership } from './guest-upgrade';

const PHONE_NUMBER_PATTERN = /^\+[1-9]\d{6,14}$/;
const PHONE_TEMP_EMAIL_DOMAIN = 'phone.heryjs.local';

export function isE164(phoneNumber: string): boolean {
  return PHONE_NUMBER_PATTERN.test(phoneNumber);
}

export function phoneTempEmail(phoneNumber: string): string {
  return `${phoneNumber.replace('+', '')}@${PHONE_TEMP_EMAIL_DOMAIN}`;
}

export function otpSmsBody(code: string): string {
  return `Your verification code is ${code}. If you did not ask for it, ignore this message.`;
}

/**
 * Every passwordless method is off until its flag says otherwise, and the
 * reason is the catch-all mount in BetterAuthController: a plugin that is
 * registered adds its routes to the public surface with no controller in this
 * repository saying so. A method nobody asked for must not be reachable.
 *
 * What is registered here keeps the kernel's tenancy: users created by any of
 * these methods go through the same user table and get the same tenant a
 * password sign-up gets, and the caller is still resolved from the database
 * by SessionAuthProvider, never from what the client claims.
 */
export async function buildPasswordlessPlugins(
  config: AuthEnv,
  client: PrismaClient,
): Promise<BetterAuthPlugin[]> {
  const plugins: BetterAuthPlugin[] = [];
  const { magicLink, emailOTP, phoneNumber, anonymous } =
    await import('better-auth/plugins');

  if (config.AUTH_MAGIC_LINK_ENABLED) {
    plugins.push(
      magicLink({
        expiresIn: config.AUTH_MAGIC_LINK_EXPIRES_SECONDS,
        disableSignUp: !config.AUTH_PASSWORDLESS_ALLOW_SIGN_UP,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url }) => {
          await sendAuthMail(new MagicLinkMailable(email, url));
        },
      }),
    );
  }

  if (config.AUTH_EMAIL_OTP_ENABLED) {
    plugins.push(
      emailOTP({
        otpLength: config.AUTH_OTP_LENGTH,
        expiresIn: config.AUTH_OTP_EXPIRES_SECONDS,
        allowedAttempts: config.AUTH_OTP_MAX_ATTEMPTS,
        disableSignUp: !config.AUTH_PASSWORDLESS_ALLOW_SIGN_UP,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendAuthMail(new EmailOtpMailable(email, otp, type));
        },
      }),
    );
  }

  if (config.AUTH_PHONE_OTP_ENABLED) {
    plugins.push(
      phoneNumber({
        otpLength: config.AUTH_OTP_LENGTH,
        expiresIn: config.AUTH_OTP_EXPIRES_SECONDS,
        allowedAttempts: config.AUTH_OTP_MAX_ATTEMPTS,
        phoneNumberValidator: isE164,
        requireVerification: true,
        sendOTP: async ({ phoneNumber: to, code }) => {
          await sendAuthSms({ to, body: otpSmsBody(code) });
        },
        signUpOnVerification: config.AUTH_PASSWORDLESS_ALLOW_SIGN_UP
          ? {
              getTempEmail: phoneTempEmail,
              getTempName: (to) => to,
            }
          : undefined,
      }),
    );
  }

  if (config.AUTH_ANONYMOUS_ENABLED) {
    plugins.push(
      anonymous({
        emailDomainName: config.AUTH_ANONYMOUS_EMAIL_DOMAIN,
        generateName: () => 'Guest',
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await moveGuestOwnership(
            client,
            anonymousUser.user.id,
            newUser.user.id,
          );
        },
      }),
    );
  }

  return plugins;
}
