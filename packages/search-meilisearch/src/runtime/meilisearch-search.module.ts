import { Global, Module } from '@nestjs/common';
import { PrivacyModule } from '#kernel/public/privacy';
import { searchDriverToken } from '#kernel/public/drivers';
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
