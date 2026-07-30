import { z } from 'zod';
import type { Workout } from '@prisma/client';

export const workoutViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  title: z.string().min(1).max(255),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type WorkoutView = z.infer<typeof workoutViewSchema>;

export function toWorkoutView(record: Workout): WorkoutView {
  return workoutViewSchema.parse(record);
}
