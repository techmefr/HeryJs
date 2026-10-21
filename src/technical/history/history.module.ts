import { Module } from '@nestjs/common';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { HistoryService } from './history.service';

@Module({
  imports: [PrismaModule],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
