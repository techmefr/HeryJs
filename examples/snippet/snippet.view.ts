import { z } from 'zod';
import type { Snippet } from '@prisma/client';

export const snippetViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  title: z.string().min(1).max(255),
  summary: z.string().min(1).max(255).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
  version: z.number().int(),
  status: z.string(),
});
export type SnippetView = z.infer<typeof snippetViewSchema>;

export function toSnippetView(record: Snippet): SnippetView {
  return snippetViewSchema.parse(record);
}
