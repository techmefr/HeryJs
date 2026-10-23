import { Global, Module } from '@nestjs/common';
import { PrivacyModule } from '@heryjs/core/privacy';
import { searchDriverToken } from '@heryjs/core/drivers';
import { MeilisearchSearchDriver } from './meilisearch-search.driver';
import { MeilisearchSearchPersonalData } from './meilisearch-search.personal-data';

const TOKEN = searchDriverToken('meilisearch');

@Global()
@Module({
  imports: [PrivacyModule],
  providers: [
    MeilisearchSearchDriver,
    MeilisearchSearchPersonalData,
    { provide: TOKEN, useExisting: MeilisearchSearchDriver },
  ],
  exports: [TOKEN],
})
export class MeilisearchSearchModule {}
