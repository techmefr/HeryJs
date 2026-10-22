import { z } from 'zod';
import { devOnlyDefault, parseModuleEnv } from '#technical/config/module-env';

const DEV_SECRET_KEY = Buffer.alloc(32, 'dev-sso-key').toString('base64');
const SECRET_KEY_BYTES = 32;

export const ssoEnv = parseModuleEnv('sso', {
  SSO_STATE_SECRET: devOnlyDefault(
    'SSO_STATE_SECRET',
    'dev-sso-state-secret-change-in-production',
  ),
  SSO_SECRET_KEY: devOnlyDefault('SSO_SECRET_KEY', DEV_SECRET_KEY).refine(
    (value) => Buffer.from(value, 'base64').length === SECRET_KEY_BYTES,
    { message: 'must be 32 bytes encoded as base64 (openssl rand -base64 32)' },
  ),
  SSO_REDIRECT_BASE_URL: z
    .url()
    .optional()
    .refine((value) => value || process.env.NODE_ENV !== 'production', {
      message:
        'must be set in production: the public origin the sso callbacks are built on',
    }),
  SSO_DNS_TXT_PREFIX: z.string().min(1).default('_hery-sso'),
  SSO_ALLOW_PRIVATE_ISSUERS: z
    .string()
    .default('false')
    .transform((value) => value === 'true')
    .refine((value) => !value || process.env.NODE_ENV !== 'production', {
      message: 'must not be enabled in production',
    }),
});
