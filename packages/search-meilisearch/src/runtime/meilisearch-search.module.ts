import { Global, Module } from '@nestjs/common';
import { searchDriverToken } from '#kernel/search/search-driver';
import { MeilisearchSearchDriver } from './meilisearch-search.driver';

const TOKEN = searchDriverToken('meilisearch');

@Global()
@Module({
  providers: [
    MeilisearchSearchDriver,
    { provide: TOKEN, useExisting: MeilisearchSearchDriver },
  ],
  exports: [TOKEN],
})
export class MeilisearchSearchModule {}
