import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { ElasticsearchSearchModule } from './elasticsearch-search.module';

export default defineHeryModule({
  name: '@heryjs/search-elasticsearch',
  module: () => ElasticsearchSearchModule,
  options: noOptions,
  extensionPoints: ['search.driver'],
});
