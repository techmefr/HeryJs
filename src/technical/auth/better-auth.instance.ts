import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
export const authPrismaClient = new PrismaClient({ adapter });

async function createAuth() {
  const { betterAuth, APIError } = await import('better-auth');
  const { prismaAdapter } = await import('better-auth/adapters/prisma');
  const { bearer } = await import('better-auth/plugins');

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
    plugins: [bearer()],
  });

  return { auth, APIError };
}

type BetterAuthContext = Awaited<ReturnType<typeof createAuth>>;

let contextPromise: Promise<BetterAuthContext> | undefined;

export function getAuthContext(): Promise<BetterAuthContext> {
  contextPromise ??= createAuth();
  return contextPromise;
}
