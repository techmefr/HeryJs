import { Global, Module } from '@nestjs/common';
import { SEARCH_DRIVER } from '#kernel/search/search-driver';
import { ElasticsearchSearchDriver } from './elasticsearch-search.driver';

@Global()
@Module({
  providers: [
    ElasticsearchSearchDriver,
    { provide: SEARCH_DRIVER, useExisting: ElasticsearchSearchDriver },
  ],
  exports: [SEARCH_DRIVER],
})
export class ElasticsearchSearchModule {}
