import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ImpersonationController],
  providers: [ImpersonationService],
})
export class ImpersonationModule {}
