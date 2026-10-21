import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { HealthModule } from '#technical/health/health.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { StudioOverviewController } from './studio-overview.controller';
import { TenantAccessController } from './tenant-access.controller';
import { TenantAccessService } from './tenant-access.service';

@Module({
  imports: [AuthModule, HealthModule, SchedulerModule],
  controllers: [TenantAccessController, StudioOverviewController],
  providers: [TenantAccessService],
})
export class AdminStudioModule {}
