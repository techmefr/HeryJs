import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { DevDashboardController } from './dev-dashboard.controller';
import { DevDashboardEnabledGuard } from './dev-dashboard.guard';
import { DevDashboardJobWatcher } from './dev-dashboard.job-watcher';
import { DevDashboardMiddleware } from './dev-dashboard.middleware';
import { DevDashboardRecorder } from './dev-dashboard.recorder';
import { DevDashboardService } from './dev-dashboard.service';
import {
  DEV_DASHBOARD_SETTINGS,
  devDashboardSettingsFromConfig,
} from './dev-dashboard.settings';
import { DevDashboardStore } from './dev-dashboard.store';
import { DevDashboardPruneTask } from './dev-dashboard.task';

@Module({
  imports: [AuthModule, JobsModule, PrismaModule, SchedulerModule],
  controllers: [DevDashboardController],
  providers: [
    {
      provide: DEV_DASHBOARD_SETTINGS,
      useFactory: devDashboardSettingsFromConfig,
    },
    DevDashboardEnabledGuard,
    DevDashboardJobWatcher,
    DevDashboardMiddleware,
    DevDashboardPruneTask,
    DevDashboardRecorder,
    DevDashboardService,
    DevDashboardStore,
  ],
  exports: [DevDashboardMiddleware, DEV_DASHBOARD_SETTINGS],
})
export class DevDashboardModule {}
