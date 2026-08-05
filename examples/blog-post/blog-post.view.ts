import { z } from 'zod';
import type { BlogPost } from '@prisma/client';

export const blogPostViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  title: z.string().min(1).max(255),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type BlogPostView = z.infer<typeof blogPostViewSchema>;

export function toBlogPostView(record: BlogPost): BlogPostView {
  return blogPostViewSchema.parse(record);
}
