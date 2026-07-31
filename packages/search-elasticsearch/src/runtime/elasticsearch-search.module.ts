import { Global, Module } from '@nestjs/common';
import { searchDriverToken } from '#kernel/search/search-driver';
import { ElasticsearchSearchDriver } from './elasticsearch-search.driver';

const TOKEN = searchDriverToken('elasticsearch');

@Global()
@Module({
  providers: [
    ElasticsearchSearchDriver,
    { provide: TOKEN, useExisting: ElasticsearchSearchDriver },
  ],
  exports: [TOKEN],
})
export class ElasticsearchSearchModule {}
