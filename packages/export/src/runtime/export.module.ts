import { Module } from '@nestjs/common';
import { HeryConfigModule } from '@heryjs/core/config';
import { DriversModule } from '@heryjs/core/drivers';
import { JobsModule } from '@heryjs/core/jobs';
import { NotificationsModule } from '@heryjs/core/notifications';
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
