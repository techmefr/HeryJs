import { Global, Module } from '@nestjs/common';
import { PrivacyModule } from '@heryjs/core/privacy';
import { searchDriverToken } from '@heryjs/core/drivers';
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
