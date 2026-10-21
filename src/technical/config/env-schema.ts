import { z } from 'zod';
import { parseSecretKeys } from '../secrets/keyring';

export const DEV_SECRETS_KEYS =
  'dev:ZGV2ZWxvcG1lbnQta2V5LW5vdC1hLXNlY3JldC0wMDA=';

function isValidSecretKeyList(value: string): boolean {
  try {
    parseSecretKeys(value);
    return true;
  } catch {
    return false;
  }
}

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
    SSE_TOKEN_SECRET: devOnlySecret('dev-sse-secret-change-in-production'),
    OAUTH_STATE_SECRET: devOnlySecret('dev-oauth-secret-change-in-production'),
    STORAGE_URL_SECRET: devOnlySecret(
      'dev-storage-secret-change-in-production',
    ),
    SECRETS_KEYS: z
      .string()
      .min(1)
      .default(DEV_SECRETS_KEYS)
      .refine(isValidSecretKeyList, {
        message:
          'must be a comma-separated list of <id>:<base64 key>, each key 32 bytes (openssl rand -base64 32)',
      }),
    SECRETS_ACTIVE_KEY_ID: z.string().min(1).optional(),
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
    OUTBOX_RELAY_ENABLED: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    BACKUP_ENABLED: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    BACKUP_CRON: z.string().min(1).default('0 3 * * *'),
    BACKUP_DIR: z.string().min(1).default('backups'),
    BACKUP_KEEP: z.coerce.number().int().min(1).default(7),
    BACKUP_STORAGE_DRIVER: z.string().min(1).optional(),
    SEARCH_MATCH_LIMIT: z.coerce.number().int().positive().default(1000),
    // The most rows a similarity search ranks and returns. Nearest-neighbour
    // search never runs out of matches -- every embedded row has a distance --
    // so without a ceiling a caller asking for "similar" would be handed the
    // whole table, ranked. Reported in meta.search once it is the reason a
    // page is short.
    VECTOR_SEARCH_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .max(1000)
      .default(50),
    /**
     * Turning the global rate-limit guard off used to ride on NODE_ENV alone,
     * which is the most-copied variable in any deployment: a staging or CI env
     * file carried into something production-like shipped an app with no
     * brute-force ceiling on auth and no throttling anywhere, silently.
     *
     * A dedicated flag makes that opt-out deliberate, and production refuses
     * it outright -- two independent mistakes are now needed to lose rate
     * limiting, instead of one stray variable.
     */
    RATE_LIMIT_DISABLED: z
      .string()
      .default('false')
      .transform((value) => value === 'true')
      .refine((disabled) => !disabled || nodeEnv !== 'production', {
        message:
          'cannot be true in production: it would leave every route, including auth, with no rate limit',
      }),
    AUTH_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    AUTH_LOCKOUT_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    AUTH_TWO_FACTOR_ISSUER: z.string().min(1).default('HeryJs'),
    AUTH_REQUIRE_EMAIL_VERIFICATION: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_EMAIL_VERIFICATION_EXPIRES_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60),
    AUTH_RESET_PASSWORD_EXPIRES_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60),
    AUTH_MAGIC_LINK_ENABLED: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_EMAIL_OTP_ENABLED: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_PHONE_OTP_ENABLED: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_ANONYMOUS_ENABLED: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_PASSKEY_ENABLED: z
      .string()
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_PASSKEY_RP_ID: z.string().min(1).optional(),
    AUTH_PASSKEY_RP_NAME: z.string().min(1).default('HeryJs'),
    AUTH_PASSKEY_ORIGIN: z.string().min(1).optional(),
    AUTH_PASSWORDLESS_ALLOW_SIGN_UP: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    AUTH_MAGIC_LINK_EXPIRES_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 60),
    AUTH_OTP_EXPIRES_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 60),
    AUTH_OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
    AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
    AUTH_ANONYMOUS_EMAIL_DOMAIN: z
      .string()
      .min(1)
      .default('guest.heryjs.local'),
    // No devOnlySecret for these four: that helper covers secrets the
    // framework owns end to end, and an OAuth client secret is issued by
    // Google or GitHub, so a placeholder could only ever produce a login
    // button that fails at the provider. Absent means "provider not
    // configured", which is the only honest reading -- see
    // buildSocialProviders, which drops a provider missing either half.
    AUTH_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    AUTH_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    AUTH_GITHUB_CLIENT_ID: z.string().min(1).optional(),
    AUTH_GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    OAUTH_LINK_POLICY: z
      .enum(['refuse', 'link-authenticated', 'link-verified'])
      .default('refuse'),
    OAUTH_ALLOW_SIGN_UP: z
      .string()
      .default('true')
      .transform((value) => value === 'true'),
    OAUTH_REDIRECT_BASE_URL: z.url().optional(),
    OAUTH_MICROSOFT_TENANT: z.string().min(1).default('common'),
    OAUTH_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    OAUTH_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    OAUTH_GITHUB_CLIENT_ID: z.string().min(1).optional(),
    OAUTH_GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    OAUTH_MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
    OAUTH_MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
    /**
     * The admin studio is dev-only unless an operator opts in. These three are
     * read per request by admin-settings.ts; they are declared here so a typo
     * stops the boot rather than reading as "off".
     */
    ADMIN_STUDIO_ENABLED: z.enum(['true', 'false']).default('false'),
    ADMIN_STUDIO_ALLOWED_IPS: z.string().optional(),
    ADMIN_STUDIO_REQUIRE_2FA: z.enum(['true', 'false']).default('false'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().min(1).optional(),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().min(1).optional(),
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: z.string().min(1).optional(),
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: z.string().min(1).optional(),
    OTEL_TRACES_EXPORTER: z.string().min(1).optional(),
    OTEL_METRICS_EXPORTER: z.string().min(1).optional(),
    OTEL_LOGS_EXPORTER: z.string().min(1).optional(),
    OTEL_SDK_DISABLED: z.string().min(1).optional(),
    OTEL_SERVICE_NAME: z.string().min(1).optional(),
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
