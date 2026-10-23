import { Global, Module } from '@nestjs/common';
import { exportDriverToken } from '@heryjs/core/drivers';
import { PdfExportDriver } from './pdf-export.driver';

const TOKEN = exportDriverToken('pdf');

@Global()
@Module({
  providers: [
    PdfExportDriver,
    { provide: TOKEN, useExisting: PdfExportDriver },
  ],
  exports: [TOKEN],
})
export class PdfExportModule {}
