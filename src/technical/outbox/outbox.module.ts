import { Module } from '@nestjs/common';
import { EventsModule } from '#technical/events/events.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { LockModule } from '#technical/lock/lock.module';
import { SchedulerModule } from '#technical/scheduler/scheduler.module';
import { OutboxEventsBridge } from './outbox-events.bridge';
import { OutboxPruneTask } from './outbox-prune.task';
import { OutboxRegistry } from './outbox.registry';
import { OutboxRelay } from './outbox.relay';
import {
  OUTBOX_RELAY_OPTIONS,
  OutboxRunner,
  outboxRelayOptionsFromEnv,
} from './outbox.runner';
import { OutboxService } from './outbox.service';

@Module({
  imports: [EventsModule, JobsModule, LockModule, SchedulerModule],
  providers: [
    OutboxRegistry,
    OutboxRelay,
    OutboxRunner,
    {
      provide: OUTBOX_RELAY_OPTIONS,
      useFactory: outboxRelayOptionsFromEnv,
    },
    OutboxService,
    OutboxEventsBridge,
    OutboxPruneTask,
  ],
  exports: [OutboxRegistry, OutboxService, OutboxRelay],
})
export class OutboxModule {}
