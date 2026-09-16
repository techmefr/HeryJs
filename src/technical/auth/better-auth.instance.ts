import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#technical/config/env';
import { authEnv } from './auth.env';
import { sendAuthMail } from './auth-mailer';
import { ResetPasswordMailable, VerifyEmailMailable } from './auth.mailables';
import { buildSocialProviders } from './social-providers';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
export const authPrismaClient = new PrismaClient({ adapter });

async function createAuth() {
  const { betterAuth, APIError } = await import('better-auth');
  const { prismaAdapter } = await import('better-auth/adapters/prisma');
  const { admin, bearer, twoFactor } = await import('better-auth/plugins');

  const auth = betterAuth({
    database: prismaAdapter(authPrismaClient, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: authEnv.AUTH_REQUIRE_EMAIL_VERIFICATION,
      resetPasswordTokenExpiresIn: authEnv.AUTH_RESET_PASSWORD_EXPIRES_SECONDS,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthMail(new ResetPasswordMailable(user.email, url));
      },
    },
    emailVerification: {
      sendOnSignUp: authEnv.AUTH_REQUIRE_EMAIL_VERIFICATION,
      autoSignInAfterVerification: true,
      expiresIn: authEnv.AUTH_EMAIL_VERIFICATION_EXPIRES_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthMail(new VerifyEmailMailable(user.email, url));
      },
    },
    socialProviders: buildSocialProviders(authEnv),
    advanced: {
      database: {
        generateId: false,
      },
    },
    plugins: [
      bearer(),
      // Only the "admin" role gets the built-in "impersonate" permission --
      // there is no role-management endpoint here, on purpose (see
      // Teams: roles are a product decision, granted by hand in the
      // database, not a convention HeryJs ships).
      admin({
        impersonationSessionDuration: env.IMPERSONATION_SESSION_SECONDS,
      }),
      // TOTP only: no SMS or email second factor, because both would make the
      // strength of 2FA depend on a transport auth does not control.
      twoFactor({
        issuer: authEnv.AUTH_TWO_FACTOR_ISSUER,
      }),
    ],
  });

  return { auth, APIError };
}

type BetterAuthContext = Awaited<ReturnType<typeof createAuth>>;

let contextPromise: Promise<BetterAuthContext> | undefined;

export function getAuthContext(): Promise<BetterAuthContext> {
  contextPromise ??= createAuth();
  return contextPromise;
}
