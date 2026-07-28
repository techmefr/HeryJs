import { Module } from '@nestjs/common';
import { AuthModule } from '../../technical/auth/auth.module';
import { CapabilitiesService } from '../../technical/capabilities/capabilities.service';
import { PrismaModule } from '../../technical/prisma/prisma.module';
import { WorkoutController } from './workout.controller';
import { WorkoutPolicy } from './workout.policy';
import { WorkoutService } from './workout.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WorkoutController],
  providers: [WorkoutService, WorkoutPolicy, CapabilitiesService],
})
export class WorkoutModule {}
