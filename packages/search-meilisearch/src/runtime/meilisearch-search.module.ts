import { Global, Module } from '@nestjs/common';
import { PrivacyModule } from '#kernel/privacy/privacy.module';
import { searchDriverToken } from '#kernel/search/search-driver';
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
