import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
