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
