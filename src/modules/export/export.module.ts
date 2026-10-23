import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#technical/public/config';
import { DriversModule } from '#technical/public/drivers';
import { JobsModule } from '#technical/public/jobs';
import { NotificationsModule } from '#technical/public/notifications';
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
