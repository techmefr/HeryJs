import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '#technical/config/env';

/**
 * The schema owner's connection, for a spec that arranges or inspects rows
 * across tenants. The app itself connects as a role row-level security
 * applies to, so its own clients only see the tenant they act for.
 */
export const databaseOwnerClient = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
  }),
});
