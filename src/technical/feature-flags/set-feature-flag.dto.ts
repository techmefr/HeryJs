import { z } from 'zod';

export const setFeatureFlagSchema = z.object({
  enabled: z.boolean(),
  tenantId: z.string().min(1).nullable().optional(),
});

export type SetFeatureFlagDto = z.infer<typeof setFeatureFlagSchema>;
