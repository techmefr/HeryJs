import { z } from 'zod';
import type { EmbeddingDriver } from '@heryjs/core/drivers';
import { EmbeddingRequestFailedException } from './embedding-request-failed.exception';
import { embeddingsEnv, openAiEmbeddingsEnv } from './embeddings.env';

const responseSchema = z.object({
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number()),
    }),
  ),
});

export class OpenAiCompatibleEmbeddingDriver implements EmbeddingDriver {
  readonly dimensions: number = embeddingsEnv.EMBEDDINGS_DIMENSIONS;

  constructor(
    private readonly settings: ReturnType<
      typeof openAiEmbeddingsEnv
    > = openAiEmbeddingsEnv(),
  ) {}

  async embed(texts: readonly string[]): Promise<number[][]> {
    const response = await this.request(texts);

    if (!response.ok) {
      throw new EmbeddingRequestFailedException(
        `the provider answered ${response.status}`,
      );
    }

    const parsed = responseSchema.safeParse(await response.json());

    if (!parsed.success) {
      throw new EmbeddingRequestFailedException(
        'the provider answered with an unexpected body',
      );
    }

    const ordered = [...parsed.data.data].sort((a, b) => a.index - b.index);

    if (ordered.length !== texts.length) {
      throw new EmbeddingRequestFailedException(
        `the provider returned ${ordered.length} embeddings for ${texts.length} texts`,
      );
    }

    return ordered.map((entry) => entry.embedding);
  }

  private async request(texts: readonly string[]): Promise<Response> {
    const { settings } = this;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (settings.EMBEDDINGS_OPENAI_API_KEY) {
      headers.authorization = `Bearer ${settings.EMBEDDINGS_OPENAI_API_KEY}`;
    }

    try {
      return await fetch(`${settings.EMBEDDINGS_OPENAI_BASE_URL}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings.EMBEDDINGS_OPENAI_MODEL,
          input: texts,
          ...(settings.EMBEDDINGS_OPENAI_SEND_DIMENSIONS
            ? { dimensions: this.dimensions }
            : {}),
        }),
        signal: AbortSignal.timeout(settings.EMBEDDINGS_OPENAI_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmbeddingRequestFailedException(
        error instanceof Error ? error.message : 'the request failed',
      );
    }
  }
}
