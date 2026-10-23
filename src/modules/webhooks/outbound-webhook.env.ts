import { z } from 'zod';
import {
  isLocalEnvironmentNow,
  parseModuleEnv,
} from '#technical/public/config';

export const outboundWebhookEnv = parseModuleEnv('webhooks', {
  WEBHOOK_SECRET_ROTATION_GRACE_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .default(24 * 60 * 60),
  WEBHOOK_DELIVERY_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  WEBHOOK_ALLOW_PRIVATE_URLS: z
    .string()
    .default('false')
    .transform((value) => value === 'true')
    .refine((value) => !value || isLocalEnvironmentNow(), {
      message: 'must not be enabled in production',
    }),
});
