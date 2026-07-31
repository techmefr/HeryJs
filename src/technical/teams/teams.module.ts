import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
