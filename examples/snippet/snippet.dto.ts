import { z } from 'zod';
import { MAX_BATCH_ENTRIES } from '#technical/http/batch';

const snippetFields = z.object({
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
function checkSnippet(
  input: Partial<z.infer<typeof snippetFields>>,
  ctx: z.RefinementCtx,
): void {
  void input;
  void ctx;
}

export const createSnippetSchema = snippetFields.superRefine(checkSnippet);
export type CreateSnippetInput = z.infer<typeof createSnippetSchema>;

// The unrefined partial is kept because a refined schema can no longer be
// extended, and the update request adds an id and a relations block to it.
// Every path that extends it re-applies the same check afterwards.
const snippetUpdateFields = snippetFields.partial();

export const updateSnippetSchema =
  snippetUpdateFields.superRefine(checkSnippet);
export type UpdateSnippetInput = z.infer<typeof updateSnippetSchema>;

// Every mutating verb separates the target (what it acts on) from the
// setting (how it acts) -- data/ids is always an array, even for a single
// record, so the response shape never has to differ between one and many.
export const createSnippetRequestSchema = z.object({
  data: z.array(createSnippetSchema).max(MAX_BATCH_ENTRIES),
});
export type CreateSnippetRequestBody = z.infer<
  typeof createSnippetRequestSchema
>;

export const updateSnippetRequestSchema = z.object({
  data: z
    .array(
      snippetUpdateFields
        .extend({
          id: z.string(),
          version: z.number().int().positive().optional(),
        })
        .superRefine(checkSnippet),
    )
    .max(MAX_BATCH_ENTRIES),
});
export type UpdateSnippetRequestBody = z.infer<
  typeof updateSnippetRequestSchema
>;

export const DELETE_MODES = ['soft', 'hard'] as const;
export type DeleteSnippetMode = (typeof DELETE_MODES)[number];

export const deleteSnippetRequestSchema = z.object({
  ids: z.array(z.string()).max(MAX_BATCH_ENTRIES),
  mode: z.enum(DELETE_MODES).default('soft'),
});
export type DeleteSnippetRequestBody = z.infer<
  typeof deleteSnippetRequestSchema
>;

export const restoreSnippetRequestSchema = z.object({
  ids: z.array(z.string()).max(MAX_BATCH_ENTRIES),
  // A short, scoped patch to reapply on restore -- not a second update, so
  // it reuses the update schema's own field whitelist rather than inventing
  // a narrower one.
  patch: updateSnippetSchema.optional(),
});
export type RestoreSnippetRequestBody = z.infer<
  typeof restoreSnippetRequestSchema
>;
