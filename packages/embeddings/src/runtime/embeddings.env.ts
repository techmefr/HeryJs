import { z } from 'zod';
import { parseModuleEnv } from '#kernel/config/module-env';

export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

export const embeddingsEnv = parseModuleEnv('embeddings', {
  EMBEDDINGS_DIMENSIONS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_EMBEDDING_DIMENSIONS),
});

export function openAiEmbeddingsEnv() {
  return parseModuleEnv('embeddings', {
    EMBEDDINGS_OPENAI_BASE_URL: z
      .string()
      .url()
      .default('https://api.openai.com/v1')
      .transform((value) => value.replace(/\/+$/, '')),
    EMBEDDINGS_OPENAI_API_KEY: z.string().min(1).optional(),
    EMBEDDINGS_OPENAI_MODEL: z
      .string()
      .min(1)
      .default('text-embedding-3-small'),
    EMBEDDINGS_OPENAI_SEND_DIMENSIONS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    EMBEDDINGS_OPENAI_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),
  });
}
