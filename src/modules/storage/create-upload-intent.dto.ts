import { z } from 'zod';

export const createUploadIntentSchema = z.object({
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

export type CreateUploadIntentDto = z.infer<typeof createUploadIntentSchema>;

export const confirmUploadIntentSchema = z.object({
  key: z.string().min(1),
});

export type ConfirmUploadIntentDto = z.infer<typeof confirmUploadIntentSchema>;
