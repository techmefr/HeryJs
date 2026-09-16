import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EVENTS_QUEUE } from '#technical/jobs/jobs.constants';
import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { EventDispatcher } from './event-dispatcher.service';
import { EVENT_DISPATCH_JOB } from './event.types';
import type { EventDispatchJobData } from './event.types';

@Processor(EVENTS_QUEUE)
export class EventsProcessor extends WorkerHost {
  private readonly logger = new Logger('Events');

  constructor(private readonly dispatcher: EventDispatcher) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== EVENT_DISPATCH_JOB) {
      return;
    }

    const data = job.data as EventDispatchJobData;
    const resolved = this.dispatcher.resolveQueued(data);

    if (!resolved) {
      // The listener was removed or renamed between enqueue and run. Failing
      // the job would retry it forever against code that no longer exists.
      this.logger.warn(
        `No listener ${data.listenerName} registered for ${data.eventName}, dropping job`,
      );
      return;
    }

    // The tenant the event was dispatched under, reopened around the handler.
    // Without it the listener runs unscoped and every tenant-scoped read or
    // write it makes crosses tenants -- which is why runInTenant has no
    // ambient default and a null tenant is left to throw here instead of
    // being papered over.
    if (data.tenantId === null) {
      await resolved.listener.handle(resolved.event);
      return;
    }

    await runInTenant(data.tenantId, async () => {
      await resolved.listener.handle(resolved.event);
    });
  }
}
