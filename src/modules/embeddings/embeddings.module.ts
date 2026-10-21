import { Global, Module } from '@nestjs/common';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { DriversModule } from '#technical/drivers/drivers.module';
import { EMBEDDER } from '#technical/embeddings/embedding-driver';
import { EmbeddingDriverRegistry } from './embedding-driver.registry';
import { EmbeddingsService } from './embeddings.service';
import { FakeEmbeddingDriver } from './fake-embedding.driver';

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
