import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  DEFAULT_QUEUE,
  EVENTS_QUEUE,
  EXPORT_QUEUE,
  IMPORT_QUEUE,
} from './jobs.constants';

@Injectable()
export class JobsService {
  private readonly queues: Record<string, Queue>;

  constructor(
    @InjectQueue(DEFAULT_QUEUE) private readonly queue: Queue,
    @InjectQueue(EXPORT_QUEUE) exports: Queue,
    @InjectQueue(IMPORT_QUEUE) imports: Queue,
    @InjectQueue(EVENTS_QUEUE) events: Queue,
  ) {
    this.queues = {
      [DEFAULT_QUEUE]: queue,
      [EXPORT_QUEUE]: exports,
      [IMPORT_QUEUE]: imports,
      [EVENTS_QUEUE]: events,
    };
  }

  dispatch(name: string, data: Record<string, unknown> = {}) {
    return this.queue.add(name, data);
  }

  /**
   * Anything with its own processor dispatches here, naming the queue that
   * processor listens on. A job put on a queue whose workers do not recognise
   * its name is not retried or dead-lettered -- the worker returns, and BullMQ
   * marks it completed -- so the queue, not the job name, is what actually
   * routes work to the right handler.
   */
  dispatchTo(
    queueName: string,
    name: string,
    data: Record<string, unknown> = {},
  ) {
    const queue = this.queues[queueName];

    if (!queue) {
      throw new Error(
        `No queue named "${queueName}" is registered. Add it to jobs.constants.ts and register it in JobsModule.`,
      );
    }

    return queue.add(name, data);
  }
}
