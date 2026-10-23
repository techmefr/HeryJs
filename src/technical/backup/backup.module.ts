import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { DriversModule } from '#technical/drivers/drivers.module';
import { PrivacyModule } from '#technical/privacy/privacy.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { BackupSettingsStore } from './backup-settings';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupTask } from './backup.task';

@Module({
  imports: [AuthModule, DriversModule, PrivacyModule, SchedulerModule],
  controllers: [BackupController],
  providers: [BackupService, BackupSettingsStore, BackupTask],
})
export class BackupModule {}
