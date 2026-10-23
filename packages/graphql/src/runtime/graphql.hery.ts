import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { GraphqlModule } from './graphql/graphql.module';

export default defineHeryModule({
  name: '@heryjs/graphql',
  module: () => GraphqlModule,
  options: noOptions,
  extensionPoints: ['auth.provider'],
});
