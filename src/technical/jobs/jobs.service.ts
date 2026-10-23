import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { withJobLocale } from './job-locale';
import { jobOptions } from './job-policy';
import type { JobPolicy } from './job-policy';
import {
  BILLING_QUEUE,
  DEFAULT_QUEUE,
  EVENTS_QUEUE,
  EXPORT_QUEUE,
  IMPORT_QUEUE,
  OUTBOX_QUEUE,
  WEBHOOK_DELIVERY_QUEUE,
  PRIVACY_QUEUE,
  WEBHOOK_QUEUE,
} from './jobs.constants';

@Injectable()
export class JobsService {
  private readonly queues: Record<string, Queue>;

  constructor(
    @InjectQueue(DEFAULT_QUEUE) private readonly queue: Queue,
    @InjectQueue(EXPORT_QUEUE) exports: Queue,
    @InjectQueue(IMPORT_QUEUE) imports: Queue,
    @InjectQueue(EVENTS_QUEUE) events: Queue,
    @InjectQueue(BILLING_QUEUE) billing: Queue,
    @InjectQueue(OUTBOX_QUEUE) outbox: Queue,
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE) webhookDeliveries: Queue,
    @InjectQueue(PRIVACY_QUEUE) privacy: Queue,
    @InjectQueue(WEBHOOK_QUEUE) webhooks: Queue,
  ) {
    this.queues = {
      [DEFAULT_QUEUE]: queue,
      [EXPORT_QUEUE]: exports,
      [IMPORT_QUEUE]: imports,
      [EVENTS_QUEUE]: events,
      [BILLING_QUEUE]: billing,
      [OUTBOX_QUEUE]: outbox,
      [WEBHOOK_DELIVERY_QUEUE]: webhookDeliveries,
      [PRIVACY_QUEUE]: privacy,
      [WEBHOOK_QUEUE]: webhooks,
    };
  }

  dispatch(
    name: string,
    data: Record<string, unknown> = {},
    policy?: JobPolicy,
  ) {
    return this.queue.add(name, withJobLocale(data), jobOptions(policy));
  }

  /**
   * Anything with its own processor dispatches here, naming the queue that
   * processor listens on. A job put on a queue whose workers do not recognise
   * its name is not retried or dead-lettered -- the worker returns, and BullMQ
   * marks it completed -- so the queue, not the job name, is what actually
   * routes work to the right handler.
   *
   * A jobId makes the dispatch idempotent: BullMQ ignores a second job under an
   * id it still holds, so two paths may queue the same work without running it
   * twice.
   */
  dispatchTo(
    queueName: string,
    name: string,
    data: Record<string, unknown> = {},
    policy?: JobPolicy,
    jobId?: string,
  ) {
    const queue = this.queues[queueName];

    if (!queue) {
      throw new Error(
        `No queue named "${queueName}" is registered. Add it to jobs.constants.ts and register it in JobsModule.`,
      );
    }

    return queue.add(name, withJobLocale(data), {
      ...jobOptions(policy),
      ...(jobId === undefined ? {} : { jobId }),
    });
  }
}
