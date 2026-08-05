import { z } from 'zod';

export const createWorkoutSchema = z.object({
  title: z.string().min(1).max(255),
});
export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;

export const updateWorkoutSchema = createWorkoutSchema.partial();
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;

// attach adds, detach removes, sync replaces the whole set in one call --
// never combined with attach/detach in the same request, since "replace with
// exactly this set" and "add/remove from whatever is there" are different
// intents that would otherwise race on the same pivot row.
const relationMutationSchema = z
  .object({
    attach: z.array(z.string()).optional(),
    detach: z.array(z.string()).optional(),
    sync: z.array(z.string()).optional(),
  })
  .refine((input) => !input.sync || (!input.attach && !input.detach), {
    message: 'sync cannot be combined with attach or detach',
  });
export type RelationMutationInput = z.infer<typeof relationMutationSchema>;

const updateWorkoutRelationsSchema = z.object({
  tags: relationMutationSchema.optional(),
});
export type UpdateWorkoutRelationsInput = z.infer<
  typeof updateWorkoutRelationsSchema
>;

// Every mutating verb separates the target (what it acts on) from the
// setting (how it acts) -- data/ids is always an array, even for a single
// record, so the response shape never has to differ between one and many.
export const createWorkoutRequestSchema = z.object({
  data: z.array(createWorkoutSchema),
});
export type CreateWorkoutRequestBody = z.infer<
  typeof createWorkoutRequestSchema
>;

export const updateWorkoutRequestSchema = z.object({
  data: z.array(
    updateWorkoutSchema.extend({
      id: z.string(),
      relations: updateWorkoutRelationsSchema.optional(),
    }),
  ),
});
export type UpdateWorkoutRequestBody = z.infer<
  typeof updateWorkoutRequestSchema
>;

export const DELETE_MODES = ['soft', 'hard'] as const;
export type DeleteWorkoutMode = (typeof DELETE_MODES)[number];

export const deleteWorkoutRequestSchema = z.object({
  ids: z.array(z.string()),
  mode: z.enum(DELETE_MODES).default('soft'),
});
export type DeleteWorkoutRequestBody = z.infer<
  typeof deleteWorkoutRequestSchema
>;

export const restoreWorkoutRequestSchema = z.object({
  ids: z.array(z.string()),
  // A short, scoped patch to reapply on restore -- not a second update, so
  // it reuses the update schema's own field whitelist rather than inventing
  // a narrower one.
  patch: updateWorkoutSchema.optional(),
});
export type RestoreWorkoutRequestBody = z.infer<
  typeof restoreWorkoutRequestSchema
>;
