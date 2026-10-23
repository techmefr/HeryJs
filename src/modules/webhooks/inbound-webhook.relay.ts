import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  JobsService,
  type OutboxDelivery,
  type OutboxHandler,
  OutboxRegistry,
  WEBHOOK_QUEUE,
} from '#technical/public/jobs';
import {
  INBOUND_WEBHOOK_HANDLER,
  INBOUND_WEBHOOK_JOB,
  INBOUND_WEBHOOK_MESSAGE,
  INBOUND_WEBHOOK_POLICY,
} from './inbound-webhook.constants';

/**
 * The event row and its outbox message are written in one transaction, so an
 * accepted webhook is never lost to a queue that was down at that moment: the
 * receiver queues the job right away, and the relay hands the message over here
 * again once Redis answers. Both use the event id as the job id, so the second
 * one is a no-op.
 */
@Injectable()
export class InboundWebhookRelay implements OutboxHandler, OnModuleInit {
  readonly name = INBOUND_WEBHOOK_HANDLER;
  readonly names = [INBOUND_WEBHOOK_MESSAGE];

  constructor(
    private readonly registry: OutboxRegistry,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(delivery: OutboxDelivery): Promise<void> {
    await this.enqueue(String(delivery.payload.eventId));
  }

  async enqueue(eventId: string): Promise<void> {
    await this.jobs.dispatchTo(
      WEBHOOK_QUEUE,
      INBOUND_WEBHOOK_JOB,
      { eventId },
      INBOUND_WEBHOOK_POLICY,
      eventId,
    );
  }
}
