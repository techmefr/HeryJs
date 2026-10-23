import { Injectable, OnModuleInit } from '@nestjs/common';
import { PersonalDataRegistry } from '#kernel/privacy/personal-data.registry';
import { MeilisearchSearchDriver } from './meilisearch-search.driver';

/**
 * An erasure deletes or anonymises rows in the database; this removes their
 * documents from Meilisearch through the driver's own remove(), which reads
 * the stored tenant first, so a document of another tenant is left alone.
 */
@Injectable()
export class MeilisearchSearchPersonalData implements OnModuleInit {
  constructor(
    private readonly registry: PersonalDataRegistry,
    private readonly driver: MeilisearchSearchDriver,
  ) {}

  onModuleInit(): void {
    this.registry.registerSearchIndexRemover(
      'meilisearch',
      (collection, id, tenantId) =>
        this.driver.remove(collection, id, tenantId),
    );
  }
}
