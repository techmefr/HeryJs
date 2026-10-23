import { Global, Module } from '@nestjs/common';
import { PrivacyModule } from '#kernel/public/privacy';
import { searchDriverToken } from '#kernel/public/drivers';
import { ElasticsearchSearchDriver } from './elasticsearch-search.driver';
import { ElasticsearchSearchPersonalData } from './elasticsearch-search.personal-data';

const TOKEN = searchDriverToken('elasticsearch');

@Global()
@Module({
  imports: [PrivacyModule],
  providers: [
    ElasticsearchSearchDriver,
    ElasticsearchSearchPersonalData,
    { provide: TOKEN, useExisting: ElasticsearchSearchDriver },
  ],
  exports: [TOKEN],
})
export class ElasticsearchSearchModule {}
