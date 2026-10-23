import { z } from 'zod';
import type { BlogPost } from '@prisma/client';
import { withResolvedTranslations } from '@heryjs/core/i18n';
import { sanitizeRichtextRead } from '@heryjs/core/resources';
import { RICHTEXT_FIELDS } from './blog-post.dto';

export const blogPostViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  title: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().nullable(),
  summaryTranslations: z.record(z.string(), z.string()),
  body: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type BlogPostView = z.infer<typeof blogPostViewSchema>;

export function toBlogPostView(record: BlogPost): BlogPostView {
  const { privateNote, ...view } = record;
  return blogPostViewSchema.parse(
    sanitizeRichtextRead(
      withResolvedTranslations(view, ['summary']),
      RICHTEXT_FIELDS,
    ),
  );
}
