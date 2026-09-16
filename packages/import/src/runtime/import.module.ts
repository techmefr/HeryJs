import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/config/hery-config.module';
import { DriversModule } from '#kernel/drivers/drivers.module';
import { JobsModule } from '#kernel/jobs/jobs.module';
import { NotificationsModule } from '#kernel/notifications/notifications.module';
import { CsvImportDriver } from './csv-import.driver';
import { ImportDriverRegistry } from './import-driver.registry';
import { ImportProcessor } from './import.processor';
import { ImportService } from './import.service';

@Module({
  imports: [JobsModule, HeryConfigModule, DriversModule, NotificationsModule],
  providers: [
    ImportService,
    ImportDriverRegistry,
    ImportProcessor,
    CsvImportDriver,
  ],
  exports: [ImportService],
})
export class ImportModule {}
