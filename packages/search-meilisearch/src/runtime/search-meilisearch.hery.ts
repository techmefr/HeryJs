import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { MeilisearchSearchModule } from './meilisearch-search.module';

export default defineHeryModule({
  name: '@heryjs/search-meilisearch',
  module: () => MeilisearchSearchModule,
  options: noOptions,
  extensionPoints: ['search.driver'],
});
