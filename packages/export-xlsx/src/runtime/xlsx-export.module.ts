import { Global, Module } from '@nestjs/common';
import { exportDriverToken } from '#kernel/public/drivers';
import { XlsxExportDriver } from './xlsx-export.driver';

const TOKEN = exportDriverToken('xlsx');

@Global()
@Module({
  providers: [
    XlsxExportDriver,
    { provide: TOKEN, useExisting: XlsxExportDriver },
  ],
  exports: [TOKEN],
})
export class XlsxExportModule {}
