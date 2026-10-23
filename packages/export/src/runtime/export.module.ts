import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/public/config';
import { DriversModule } from '#kernel/public/drivers';
import { JobsModule } from '#kernel/public/jobs';
import { NotificationsModule } from '#kernel/public/notifications';
import { CsvExportDriver } from './csv-export.driver';
import { ExportDriverRegistry } from './export-driver.registry';
import { ExportProcessor } from './export.processor';
import { ExportService } from './export.service';

@Module({
  imports: [JobsModule, HeryConfigModule, DriversModule, NotificationsModule],
  providers: [
    ExportService,
    ExportDriverRegistry,
    ExportProcessor,
    CsvExportDriver,
  ],
  exports: [ExportService],
})
export class ExportModule {}
