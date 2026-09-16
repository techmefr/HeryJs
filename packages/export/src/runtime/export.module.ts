import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/config/hery-config.module';
import { DriversModule } from '#kernel/drivers/drivers.module';
import { JobsModule } from '#kernel/jobs/jobs.module';
import { NotificationsModule } from '#kernel/notifications/notifications.module';
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
