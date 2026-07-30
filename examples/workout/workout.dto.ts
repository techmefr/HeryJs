import { z } from 'zod';

export const createWorkoutSchema = z.object({
  title: z.string().min(1).max(255),
});
export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;

export const updateWorkoutSchema = createWorkoutSchema.partial();
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;
