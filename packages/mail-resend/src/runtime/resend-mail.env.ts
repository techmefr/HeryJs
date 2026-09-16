import { z } from 'zod';
import { parseModuleEnv } from '#kernel/config/module-env';

/**
 * Parsed lazily, as a function rather than a module-level constant, so that an
 * app declaring this driver in hery.config.ts but running on `log` in
 * development is not refused boot over credentials it will never use. The
 * registry still resolves the driver at boot; only its secrets wait until it
 * actually sends.
 */
export function resendMailEnv() {
  return parseModuleEnv('mail-resend', {
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM: z.string().min(1),
  });
}
