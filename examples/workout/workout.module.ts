import { Module } from '@nestjs/common';
import { AuthModule } from '../../src/technical/auth/auth.module';
import { CapabilitiesService } from '../../src/technical/capabilities/capabilities.service';
import { PrismaModule } from '../../src/technical/prisma/prisma.module';
import { SignalModule } from '../../src/technical/signal/signal.module';
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
  imports: [PrismaModule, AuthModule, SignalModule],
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
