import { Module } from '@nestjs/common';
import { JobsModule } from '#technical/jobs/jobs.module';
import { EventDispatcher } from './event-dispatcher.service';
import { EventsProcessor } from './events.processor';

@Module({
  imports: [JobsModule],
  providers: [EventDispatcher, EventsProcessor],
  exports: [EventDispatcher],
})
export class EventsModule {}
