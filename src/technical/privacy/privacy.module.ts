import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { ErasureReplay } from './erasure-replay';
import { PersonalDataRegistry } from './personal-data.registry';
import { PrivacyController } from './privacy.controller';
import { PrivacyExecutor } from './privacy.executor';
import { PrivacyProcessor } from './privacy.processor';
import { PrivacyRetentionTask } from './privacy-retention.task';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [PrismaModule, AuthModule, JobsModule, SchedulerModule],
  controllers: [PrivacyController],
  providers: [
    PersonalDataRegistry,
    PrivacyService,
    PrivacyExecutor,
    ErasureReplay,
    PrivacyProcessor,
    PrivacyRetentionTask,
  ],
  exports: [PersonalDataRegistry, ErasureReplay],
})
export class PrivacyModule {}
