import { z } from 'zod';

export const setQuotaOverrideSchema = z.object({
  tenantId: z.string().min(1),
  limit: z.number().int().min(0).max(2_147_483_647).nullable(),
});

export const resetQuotaSchema = z.object({
  tenantId: z.string().min(1),
});

export type SetQuotaOverrideDto = z.infer<typeof setQuotaOverrideSchema>;
export type ResetQuotaDto = z.infer<typeof resetQuotaSchema>;
