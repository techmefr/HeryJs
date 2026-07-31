import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#technical/config/env';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
export const authPrismaClient = new PrismaClient({ adapter });

const IMPERSONATION_SESSION_SECONDS = 30 * 60;

async function createAuth() {
  const { betterAuth, APIError } = await import('better-auth');
  const { prismaAdapter } = await import('better-auth/adapters/prisma');
  const { admin, bearer } = await import('better-auth/plugins');

  const auth = betterAuth({
    database: prismaAdapter(authPrismaClient, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
    },
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
      admin({ impersonationSessionDuration: IMPERSONATION_SESSION_SECONDS }),
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
