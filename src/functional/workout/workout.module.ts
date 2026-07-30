import { Module } from '@nestjs/common';
import { AuthModule } from '../../technical/auth/auth.module';
import { CapabilitiesService } from '../../technical/capabilities/capabilities.service';
import { PrismaModule } from '../../technical/prisma/prisma.module';
import { WorkoutController } from './workout.controller';
import { WorkoutPolicy } from './workout.policy';
import { WorkoutService } from './workout.service';
import {
  WORKOUT_RECORD_LOADER,
  WORKOUT_VISIBLE_RECORD_LOADER,
  WorkoutRecordLoader,
  WorkoutVisibleRecordLoader,
} from './workout-record.loader';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WorkoutController],
  providers: [
    WorkoutService,
    WorkoutPolicy,
    CapabilitiesService,
    { provide: WORKOUT_RECORD_LOADER, useClass: WorkoutRecordLoader },
    {
      provide: WORKOUT_VISIBLE_RECORD_LOADER,
      useClass: WorkoutVisibleRecordLoader,
    },
  ],
})
export class WorkoutModule {}
