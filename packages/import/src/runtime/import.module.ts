import { Module } from '@nestjs/common';
import { HeryConfigModule } from '@heryjs/core/config';
import { DriversModule } from '@heryjs/core/drivers';
import { JobsModule } from '@heryjs/core/jobs';
import { NotificationsModule } from '@heryjs/core/notifications';
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
