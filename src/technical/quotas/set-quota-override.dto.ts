import { z } from 'zod';

export const setQuotaOverrideSchema = z.object({
  tenantId: z.string().min(1),
  limit: z.number().int().min(0).max(2_147_483_647).nullable(),
});

export type SetQuotaOverrideDto = z.infer<typeof setQuotaOverrideSchema>;
