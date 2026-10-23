import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#kernel/public/config';
import { DriversModule } from '#kernel/public/drivers';
import { JobsModule } from '#kernel/public/jobs';
import { NotificationsModule } from '#kernel/public/notifications';
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
