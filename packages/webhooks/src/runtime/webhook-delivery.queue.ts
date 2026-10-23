import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  jobOptions,
  type JobPolicy,
  WEBHOOK_DELIVERY_QUEUE,
} from '#kernel/public/jobs';
import {
  OUTBOUND_WEBHOOK_JOB,
  OUTBOUND_WEBHOOK_POLICY,
} from './outbound-webhook.constants';

export interface WebhookDeliveryJobData {
  deliveryId: string;
}

/**
 * One queue job per delivery run. The job id is the delivery id plus its round,
 * so queueing the same run twice (the relay handing a message over again after a
 * crash) collapses into one job, while a manual redeliveration gets a new id and
 * is not swallowed by the failed job BullMQ still retains for the last one.
 * BullMQ refuses a colon in a custom id, hence the dash.
 */
@Injectable()
export class WebhookDeliveryQueue {
  constructor(
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE) private readonly queue: Queue,
    @Inject(OUTBOUND_WEBHOOK_POLICY) private readonly policy: JobPolicy,
  ) {}

  async enqueue(delivery: { id: string; round: number }): Promise<void> {
    const data: WebhookDeliveryJobData = { deliveryId: delivery.id };

    await this.queue.add(OUTBOUND_WEBHOOK_JOB, data, {
      ...jobOptions(this.policy),
      jobId: `${delivery.id}-${delivery.round}`,
    });
  }
}
