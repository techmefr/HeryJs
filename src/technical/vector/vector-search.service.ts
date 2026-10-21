import { Inject, Injectable } from '@nestjs/common';
import type { ScopeWhere } from '#technical/capabilities/scope-where';
import { env } from '#technical/config/env';
import { EmbeddingDimensionMismatchException } from '#technical/embeddings/embedding-dimension-mismatch.exception';
import { EMBEDDER } from '#technical/embeddings/embedding-driver';
import type { Embedder } from '#technical/embeddings/embedding-driver';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { vectorScopeFrom } from './vector-scope';
import { VectorStore } from './vector-store';
import { DEFAULT_VECTOR_METRIC } from './vector-target';
import type { VectorMetric, VectorTarget, VectorTrash } from './vector-target';
import { VectorTargetRegistry } from './vector-target.registry';

export interface SimilarSearchInput {
  text: string;
  scope: ScopeWhere;
  trash: VectorTrash;
  metric?: VectorMetric;
}

export interface SimilarMatches {
  ids: string[];
  truncated: boolean;
  limit: number;
  metric: VectorMetric;
}

@Injectable()
export class VectorSearchService {
  constructor(
    private readonly store: VectorStore,
    private readonly targets: VectorTargetRegistry,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
  ) {}

  track(target: VectorTarget): void {
    this.targets.track(target);
  }

  async similar(
    target: VectorTarget,
    input: SimilarSearchInput,
  ): Promise<SimilarMatches> {
    const metric = input.metric ?? DEFAULT_VECTOR_METRIC;
    const limit = env.VECTOR_SEARCH_LIMIT;
    const vector = await this.embedder.embedOne(input.text);

    if (vector.length !== target.dimensions) {
      throw new EmbeddingDimensionMismatchException(
        target.dimensions,
        vector.length,
      );
    }

    const rows = await this.store.similar(target, {
      vector,
      metric,
      limit: limit + 1,
      tenantId: TenantContextStorage.getTenantId(),
      scope: vectorScopeFrom(input.scope),
      trash: input.trash,
    });

    return {
      ids: rows.slice(0, limit).map((row) => row.id),
      truncated: rows.length > limit,
      limit,
      metric,
    };
  }
}
