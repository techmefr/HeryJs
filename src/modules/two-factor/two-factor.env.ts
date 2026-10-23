import { z } from 'zod';
import { devOnlyDefault, parseModuleEnv } from '#technical/public/config';
import { DEV_ENCRYPTION_KEY } from './two-factor.constants';

const DEFAULT_ISSUER = 'HeryJs';
const DEFAULT_SESSION_SECONDS = 12 * 60 * 60;
const DEFAULT_DRIFT_WINDOW = 1;
const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_LOCK_SECONDS = 15 * 60;
const MAX_DRIFT_WINDOW = 5;

export type TwoFactorEnv = ReturnType<typeof parseTwoFactorEnv>;

function parseTwoFactorEnv() {
  return parseModuleEnv('two-factor', {
    TWO_FACTOR_ENCRYPTION_KEY: devOnlyDefault(
      'TWO_FACTOR_ENCRYPTION_KEY',
      DEV_ENCRYPTION_KEY,
    ).refine((value) => /^[0-9a-f]{64}$/i.test(value), {
      message: 'must be 64 hexadecimal characters (a 32-byte key)',
    }),
    TWO_FACTOR_ISSUER: z.string().min(1).default(DEFAULT_ISSUER),
    TWO_FACTOR_SESSION_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_SESSION_SECONDS),
    TWO_FACTOR_DRIFT_WINDOW: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_DRIFT_WINDOW)
      .default(DEFAULT_DRIFT_WINDOW),
    TWO_FACTOR_MAX_FAILURES: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_MAX_FAILURES),
    TWO_FACTOR_LOCK_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_LOCK_SECONDS),
  });
}

let cached: TwoFactorEnv | null = null;

export function twoFactorEnv(): TwoFactorEnv {
  cached ??= parseTwoFactorEnv();

  return cached;
}
