import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { PrismaModule } from '#kernel/prisma/prisma.module';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ImpersonationController],
  providers: [ImpersonationService],
})
export class ImpersonationModule {}
