import { z } from 'zod';

/**
 * Split from env.ts so this file has no side effect: env.ts's bottom-level
 * call to parseEnv against the live process environment throws on an invalid
 * environment the moment it is imported, and the lint rule that reads
 * buildPublicSchema's keys runs during `hery lint`, often before any .env
 * exists at all (a fresh scaffold, CI lint-only jobs). Importing that here
 * would take the lint command down with it.
 */
export function buildServerSchema(nodeEnv: string | undefined) {
  const devOnlySecret = (devValue: string) =>
    z
      .string()
      .min(1)
      .default(devValue)
      .refine((value) => value !== devValue || nodeEnv !== 'production', {
        message: `is still the development default (${devValue}); set it to a real secret`,
      });

  return z.object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    PORT: z.coerce.number().int().positive().default(3000),
    REDIS_URL: z.string().min(1).default('redis://localhost:6479'),
    SIGNAL_TOKEN_SECRET: devOnlySecret(
      'dev-signal-secret-change-in-production',
    ),
    STORAGE_URL_SECRET: devOnlySecret(
      'dev-storage-secret-change-in-production',
    ),
    RLS_ENABLED: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    IMPERSONATION_SESSION_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 60),
    WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 60),
    // How many full-text matches a search engine is asked for before the
    // result set is cut. Every engine has a default of its own -- 10 hits for
    // Elasticsearch, 20 for Meilisearch, unbounded for the Prisma driver --
    // and inheriting three different silent limits is what this replaces: one
    // declared limit, applied by every driver, reported when it is reached.
    SEARCH_MATCH_LIMIT: z.coerce.number().int().positive().default(1000),
  });
}

/**
 * Everything a browser is allowed to receive. `admin/` and the admin-astro
 * module inline these into the client bundle at build time, so this schema
 * is also the list of the only names allowed to make that trip -- see
 * no-server-env-in-client, which flags a client-side read of anything not
 * declared here.
 */
export function buildPublicSchema() {
  return z.object({
    PUBLIC_API_URL: z.string().min(1).default('http://localhost:3000'),
  });
}

export function publicEnvKeys(): string[] {
  return Object.keys(buildPublicSchema().shape);
}
