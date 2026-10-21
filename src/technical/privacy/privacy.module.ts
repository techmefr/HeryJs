import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { PersonalDataRegistry } from './personal-data.registry';
import { PrivacyController } from './privacy.controller';
import { PrivacyExecutor } from './privacy.executor';
import { PrivacyProcessor } from './privacy.processor';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [PrismaModule, AuthModule, JobsModule],
  controllers: [PrivacyController],
  providers: [
    PersonalDataRegistry,
    PrivacyService,
    PrivacyExecutor,
    PrivacyProcessor,
  ],
  exports: [PersonalDataRegistry],
})
export class PrivacyModule {}
