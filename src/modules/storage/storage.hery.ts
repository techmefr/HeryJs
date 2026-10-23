import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { StorageModule } from './storage.module';

export default defineHeryModule({
  name: '@heryjs/storage',
  module: () => StorageModule,
  options: noOptions,
  extensionPoints: ['storage.driver'],
});
