import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationExpiryTask } from './impersonation-expiry.task';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [PrismaModule, AuthModule, SchedulerModule],
  controllers: [ImpersonationController],
  providers: [ImpersonationService, ImpersonationExpiryTask],
})
export class ImpersonationModule {}
