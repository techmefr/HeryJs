import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { ExportModule } from './export.module';

export default defineHeryModule({
  name: '@heryjs/export',
  module: () => ExportModule,
  options: noOptions,
  extensionPoints: ['export.driver'],
});
