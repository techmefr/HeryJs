import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { PrismaModule } from '#kernel/prisma/prisma.module';
import { SchedulerModule } from '#kernel/scheduler/scheduler.module';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationExpiryTask } from './impersonation-expiry.task';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [PrismaModule, AuthModule, SchedulerModule],
  controllers: [ImpersonationController],
  providers: [ImpersonationService, ImpersonationExpiryTask],
})
export class ImpersonationModule {}
