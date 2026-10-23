import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { XlsxExportModule } from './xlsx-export.module';

export default defineHeryModule({
  name: '@heryjs/export-xlsx',
  module: () => XlsxExportModule,
  options: noOptions,
  requires: ['@heryjs/export'],
  extensionPoints: ['export.driver'],
});
