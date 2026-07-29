import { z } from 'zod';

export const runSeederSchema = z.object({
  count: z.number().int().positive().max(1000).optional(),
});

export type RunSeederDto = z.infer<typeof runSeederSchema>;
