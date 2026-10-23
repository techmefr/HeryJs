import { Module } from '@nestjs/common';
import { AuthModule } from '@heryjs/core/auth';
import { PrismaModule } from '@heryjs/core/database';
import { SchedulerModule } from '@heryjs/core/jobs';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationExpiryTask } from './impersonation-expiry.task';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [PrismaModule, AuthModule, SchedulerModule],
  controllers: [ImpersonationController],
  providers: [ImpersonationService, ImpersonationExpiryTask],
})
export class ImpersonationModule {}
