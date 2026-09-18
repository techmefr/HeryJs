import { z } from 'zod';
import { parseModuleEnv } from '#kernel/config/module-env';

/**
 * Parsed lazily: an app declaring this driver in hery.config.ts but running on
 * `log` in development is not refused boot over a webhook secret it will never
 * check. The registry still resolves the driver at boot; only its secret waits
 * until a webhook actually arrives.
 */
export function stripeBillingEnv() {
  return parseModuleEnv('billing-stripe', {
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    STRIPE_SIGNATURE_TOLERANCE_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(300),
  });
}
