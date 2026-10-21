import { z } from 'zod';
import type { BlogPost } from '@prisma/client';
import { withResolvedTranslations } from '#technical/i18n/translatable';

export const blogPostViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  title: z.string().min(1).max(255),
  summary: z.string().nullable(),
  summaryTranslations: z.record(z.string(), z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type BlogPostView = z.infer<typeof blogPostViewSchema>;

export function toBlogPostView(record: BlogPost): BlogPostView {
  const { privateNote, ...view } = record;
  return blogPostViewSchema.parse(withResolvedTranslations(view, ['summary']));
}
