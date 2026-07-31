import { Global, Module } from '@nestjs/common';
import { SEARCH_DRIVER } from '#kernel/search/search-driver';
import { MeilisearchSearchDriver } from './meilisearch-search.driver';

@Global()
@Module({
  providers: [
    MeilisearchSearchDriver,
    { provide: SEARCH_DRIVER, useExisting: MeilisearchSearchDriver },
  ],
  exports: [SEARCH_DRIVER],
})
export class MeilisearchSearchModule {}
