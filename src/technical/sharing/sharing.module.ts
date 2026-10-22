import { Module } from '@nestjs/common';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { PrivacyModule } from '#technical/privacy/privacy.module';
import { SharingPersonalData } from './sharing.personal-data';
import { SharingService } from './sharing.service';

@Module({
  imports: [PrismaModule, PrivacyModule],
  providers: [SharingService, SharingPersonalData],
  exports: [SharingService],
})
export class SharingModule {}
