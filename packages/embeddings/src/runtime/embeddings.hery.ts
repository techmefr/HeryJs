import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { EmbeddingsModule } from './embeddings.module';

export default defineHeryModule({
  name: '@heryjs/embeddings',
  module: () => EmbeddingsModule,
  options: noOptions,
  extensionPoints: ['embeddings.driver', 'vector.search'],
});
