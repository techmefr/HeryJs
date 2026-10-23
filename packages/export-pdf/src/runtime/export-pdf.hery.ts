import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { PdfExportModule } from './pdf-export.module';

export default defineHeryModule({
  name: '@heryjs/export-pdf',
  module: () => PdfExportModule,
  options: noOptions,
  requires: ['@heryjs/export'],
  extensionPoints: ['export.driver'],
});
