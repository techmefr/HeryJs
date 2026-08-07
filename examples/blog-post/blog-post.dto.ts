import { z } from 'zod';
import { MAX_BATCH_ENTRIES } from '#technical/http/batch';

export const createBlogPostSchema = z.object({
  title: z.string().min(1).max(255),
});
export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;

export const updateBlogPostSchema = createBlogPostSchema.partial();
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;

// attach adds, detach removes, sync replaces the whole set in one call --
// never combined with attach/detach in the same request, since "replace with
// exactly this set" and "add/remove from whatever is there" are different
// intents that would otherwise race on the same pivot row.
const relationMutationSchema = z
  .object({
    attach: z.array(z.string()).max(MAX_BATCH_ENTRIES).optional(),
    detach: z.array(z.string()).max(MAX_BATCH_ENTRIES).optional(),
    sync: z.array(z.string()).max(MAX_BATCH_ENTRIES).optional(),
  })
  .refine((input) => !input.sync || (!input.attach && !input.detach), {
    message: 'sync cannot be combined with attach or detach',
  });
export type RelationMutationInput = z.infer<typeof relationMutationSchema>;

const updateBlogPostRelationsSchema = z.object({
  tags: relationMutationSchema.optional(),
});
export type UpdateBlogPostRelationsInput = z.infer<
  typeof updateBlogPostRelationsSchema
>;

// Every mutating verb separates the target (what it acts on) from the
// setting (how it acts) -- data/ids is always an array, even for a single
// record, so the response shape never has to differ between one and many.
export const createBlogPostRequestSchema = z.object({
  data: z.array(createBlogPostSchema).max(MAX_BATCH_ENTRIES),
});
export type CreateBlogPostRequestBody = z.infer<
  typeof createBlogPostRequestSchema
>;

export const updateBlogPostRequestSchema = z.object({
  data: z
    .array(
      updateBlogPostSchema.extend({
        id: z.string(),
        relations: updateBlogPostRelationsSchema.optional(),
      }),
    )
    .max(MAX_BATCH_ENTRIES),
});
export type UpdateBlogPostRequestBody = z.infer<
  typeof updateBlogPostRequestSchema
>;

export const DELETE_MODES = ['soft', 'hard'] as const;
export type DeleteBlogPostMode = (typeof DELETE_MODES)[number];

export const deleteBlogPostRequestSchema = z.object({
  ids: z.array(z.string()).max(MAX_BATCH_ENTRIES),
  mode: z.enum(DELETE_MODES).default('soft'),
});
export type DeleteBlogPostRequestBody = z.infer<
  typeof deleteBlogPostRequestSchema
>;

export const restoreBlogPostRequestSchema = z.object({
  ids: z.array(z.string()).max(MAX_BATCH_ENTRIES),
  // A short, scoped patch to reapply on restore -- not a second update, so
  // it reuses the update schema's own field whitelist rather than inventing
  // a narrower one.
  patch: updateBlogPostSchema.optional(),
});
export type RestoreBlogPostRequestBody = z.infer<
  typeof restoreBlogPostRequestSchema
>;
