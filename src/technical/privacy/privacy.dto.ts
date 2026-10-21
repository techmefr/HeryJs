import { z } from 'zod';

export const exportRequestSchema = z.object({
  userId: z.string().min(1).optional(),
});

export const eraseUserRequestSchema = z.object({
  userId: z.string().min(1),
});

// The tenant to erase is always the caller's own. Asking for it by name is a
// confirmation, not a selector: a body that does not match is refused.
export const eraseTenantRequestSchema = z.object({
  confirm: z.string().min(1),
});

export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
export type EraseUserRequestInput = z.infer<typeof eraseUserRequestSchema>;
export type EraseTenantRequestInput = z.infer<typeof eraseTenantRequestSchema>;
