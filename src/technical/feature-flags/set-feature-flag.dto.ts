import { z } from 'zod';

export const setFeatureFlagSchema = z.object({
  enabled: z.boolean(),
  scope: z.enum(['global', 'tenant']).default('global'),
});

export type SetFeatureFlagDto = z.infer<typeof setFeatureFlagSchema>;
