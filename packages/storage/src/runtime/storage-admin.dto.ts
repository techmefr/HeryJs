import { z } from 'zod';

export const deleteFileSchema = z.object({
  key: z.string().min(1),
});

export type DeleteFileDto = z.infer<typeof deleteFileSchema>;
