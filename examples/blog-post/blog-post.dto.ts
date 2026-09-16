import { z } from 'zod';
import { MAX_BATCH_ENTRIES } from '#technical/http/batch';

const blogPostFields = z.object({
  title: z.string().min(1).max(255),
});

/**
 * Where a rule that spans more than one field goes: "required only when status
 * is published", "endsAt must come after startsAt", "exactly one of these two".
 * A single field's own shape stays on the field above -- this is for the ones
 * no single field can express.
 *
 * It is empty because the blueprint cannot know them, and it is yours to fill:
 * this file is generated once and owned by you afterwards. Rules live here
 * rather than in the service so that a rejection is a 400 shaped like every
 * other validation error, naming the field it belongs to, instead of an
 * exception thrown halfway through a write.
 *
 * Add an issue per broken rule, with the path pointing at the field a caller
 * would have to fix:
 *
 *   if (input.status === 'published' && !input.publishedAt) {
 *     ctx.addIssue({
 *       code: 'custom',
 *       path: ['publishedAt'],
 *       message: 'is required when status is published',
 *     });
 *   }
 *
 * Applied to create and update alike. On update every field is optional, so a
 * rule reading two fields has to tolerate either being absent -- a partial
 * update that touches neither is not the request that breaks the rule.
 */
function checkBlogPost(
  input: Partial<z.infer<typeof blogPostFields>>,
  ctx: z.RefinementCtx,
): void {
  void input;
  void ctx;
}

export const createBlogPostSchema = blogPostFields.superRefine(checkBlogPost);
export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;

// The unrefined partial is kept because a refined schema can no longer be
// extended, and the update request adds an id and a relations block to it.
// Every path that extends it re-applies the same check afterwards.
const blogPostUpdateFields = blogPostFields.partial();

export const updateBlogPostSchema =
  blogPostUpdateFields.superRefine(checkBlogPost);
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
      blogPostUpdateFields
        .extend({
          id: z.string(),
          relations: updateBlogPostRelationsSchema.optional(),
        })
        .superRefine(checkBlogPost),
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
