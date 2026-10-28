import { z } from 'zod';
import { parseModuleEnv } from '@heryjs/core/config';

export function sentryErrorReporterEnv() {
  return parseModuleEnv('error-reporter-sentry', {
    SENTRY_DSN: z.string().min(1),
    SENTRY_ENVIRONMENT: z.string().min(1).optional(),
    SENTRY_RELEASE: z.string().min(1).optional(),
  });
}
