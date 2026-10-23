import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/public/auth';
import { PrismaModule } from '#kernel/public/database';
import { SchedulerModule } from '#kernel/public/jobs';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationExpiryTask } from './impersonation-expiry.task';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [PrismaModule, AuthModule, SchedulerModule],
  controllers: [ImpersonationController],
  providers: [ImpersonationService, ImpersonationExpiryTask],
})
export class ImpersonationModule {}
