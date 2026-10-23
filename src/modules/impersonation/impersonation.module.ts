import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/public/auth';
import { PrismaModule } from '#technical/public/database';
import { SchedulerModule } from '#technical/public/jobs';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationExpiryTask } from './impersonation-expiry.task';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [PrismaModule, AuthModule, SchedulerModule],
  controllers: [ImpersonationController],
  providers: [ImpersonationService, ImpersonationExpiryTask],
})
export class ImpersonationModule {}
