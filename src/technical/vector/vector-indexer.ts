import { Inject, Injectable } from '@nestjs/common';
import { EmbeddingDimensionMismatchException } from '#technical/embeddings/embedding-dimension-mismatch.exception';
import { EMBEDDER } from '#technical/embeddings/embedding-driver';
import type { Embedder } from '#technical/embeddings/embedding-driver';
import { VectorStore } from './vector-store';
import type { VectorTarget } from './vector-target';

@Injectable()
export class VectorIndexer {
  constructor(
    private readonly store: VectorStore,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
  ) {}

  async embedRecord(
    target: VectorTarget,
    id: string,
    tenantId: string,
  ): Promise<void> {
    const text = await this.store.readSource(target, id, tenantId);

    if (text === null || text.trim() === '') {
      await this.store.write(target, id, tenantId, null);
      return;
    }

    const vector = await this.embedder.embedOne(text);

    if (vector.length !== target.dimensions) {
      throw new EmbeddingDimensionMismatchException(
        target.dimensions,
        vector.length,
      );
    }

    await this.store.write(target, id, tenantId, vector);
  }
}
