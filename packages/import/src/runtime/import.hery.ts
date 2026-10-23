import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { ImportModule } from './import.module';

export default defineHeryModule({
  name: '@heryjs/import',
  module: () => ImportModule,
  options: noOptions,
  extensionPoints: ['import.driver'],
});
