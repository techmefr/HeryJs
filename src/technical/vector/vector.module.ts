import { Module } from '@nestjs/common';
import { OutboxModule } from '#technical/outbox/outbox.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { VectorEmbeddingHandler } from './vector-embedding.handler';
import { VectorIndexer } from './vector-indexer';
import { VectorSearchService } from './vector-search.service';
import { VectorStore } from './vector-store';
import { VectorTargetRegistry } from './vector-target.registry';

@Module({
  imports: [PrismaModule, OutboxModule],
  providers: [
    VectorStore,
    VectorIndexer,
    VectorTargetRegistry,
    VectorSearchService,
    VectorEmbeddingHandler,
  ],
  exports: [VectorSearchService, VectorStore, VectorIndexer],
})
export class VectorModule {}
