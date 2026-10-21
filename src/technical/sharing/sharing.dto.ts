import { z } from 'zod';

export const grantShareSchema = z.object({
  granteeType: z.enum(['user', 'team']),
  granteeId: z.string().min(1).max(200),
  access: z.enum(['read', 'write']),
});

export type GrantShareInput = z.infer<typeof grantShareSchema>;
