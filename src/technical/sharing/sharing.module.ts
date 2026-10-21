import { Module } from '@nestjs/common';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SharingService } from './sharing.service';

@Module({
  imports: [PrismaModule],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
