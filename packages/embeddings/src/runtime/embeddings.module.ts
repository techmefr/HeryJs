import { Global, Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/public/config';
import { DriversModule, EMBEDDER } from '#kernel/public/drivers';
import { EmbeddingDriverRegistry } from './embedding-driver.registry';
import { EmbeddingsService } from './embeddings.service';
import { FakeEmbeddingDriver } from './fake-embedding.driver';
import './embeddings.catalogue';

@Global()
@Module({
  imports: [HeryConfigModule, DriversModule],
  providers: [
    EmbeddingsService,
    EmbeddingDriverRegistry,
    FakeEmbeddingDriver,
    { provide: EMBEDDER, useExisting: EmbeddingsService },
  ],
  exports: [EmbeddingsService, EMBEDDER],
})
export class EmbeddingsModule {}
