import { z } from 'zod';

/**
 * A secret with a default is a secret every reader of this repository knows, so
 * it only works as a development convenience: production has to bring its own.
 * The default was documented as "change this before you deploy" and enforced
 * nowhere, which is a comment, not a boundary. Each purpose gets its own secret
 * -- one value signing both the signal tokens and the storage URLs means a leak
 * from either side forges both.
 */
function buildSchema(nodeEnv: string | undefined) {
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

export function parseEnv(source: NodeJS.ProcessEnv) {
  const result = buildSchema(source.NODE_ENV).safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

export const env = parseEnv(process.env);
