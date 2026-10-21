import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EmbeddingDimensionMismatchException } from '#technical/embeddings/embedding-dimension-mismatch.exception';
import { EMBEDDER } from '#technical/embeddings/embedding-driver';
import type { Embedder } from '#technical/embeddings/embedding-driver';
import { OUTBOX_MODEL_NAME_PREFIX } from '#technical/outbox/outbox.constants';
import { OutboxRegistry } from '#technical/outbox/outbox.registry';
import type {
  OutboxDelivery,
  OutboxHandler,
} from '#technical/outbox/outbox.types';
import { VectorStore } from './vector-store';
import { VectorTargetRegistry } from './vector-target.registry';

const HANDLER_NAME = 'vector-embedding';

function stringsIn(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

@Injectable()
export class VectorEmbeddingHandler implements OutboxHandler, OnModuleInit {
  readonly name = HANDLER_NAME;
  readonly names = [
    `${OUTBOX_MODEL_NAME_PREFIX}created`,
    `${OUTBOX_MODEL_NAME_PREFIX}updated`,
  ];

  constructor(
    private readonly outbox: OutboxRegistry,
    private readonly targets: VectorTargetRegistry,
    private readonly store: VectorStore,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
  ) {}

  onModuleInit(): void {
    this.outbox.register(this);
  }

  async handle(delivery: OutboxDelivery): Promise<void> {
    const { payload } = delivery;
    const target =
      typeof payload.model === 'string'
        ? this.targets.find(payload.model)
        : null;
    const id = typeof payload.recordId === 'string' ? payload.recordId : null;
    const tenantId =
      typeof payload.tenantId === 'string' ? payload.tenantId : null;

    if (!target || !id || !tenantId) {
      return;
    }

    const isUpdate = payload.kind === 'updated';
    const touchesSource = stringsIn(payload.changedFields).includes(
      target.sourceColumn,
    );

    if (isUpdate && !touchesSource) {
      return;
    }

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
