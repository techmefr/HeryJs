import { z } from 'zod';
import { parseModuleEnv } from '@heryjs/core/config';

const FLAG = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export function observeEnv() {
  return parseModuleEnv('observe', {
    OBSERVE_ENABLED: FLAG,
    OBSERVE_SERVICE_ID: z.string().min(1).default('heryjs'),
    OBSERVE_ENDPOINT: z.url({ protocol: /^https$/ }).optional(),
    OBSERVE_FORWARD_LOGS: FLAG,
    OBSERVE_SOURCE_CONTEXT: FLAG,
  });
}
