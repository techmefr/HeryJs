import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { WEBHOOK_QUEUE } from '#technical/jobs/jobs.constants';
import type { VerifiedWebhookEndpoint } from './webhook-signature.guard';

export interface ReceivedWebhook {
  endpoint: VerifiedWebhookEndpoint;
  rawBody: Buffer;
}

@Injectable()
export class WebhooksService {
  constructor(@InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue) {}

  createEndpoint(tenantId: string, source: string) {
    return authPrismaClient.webhookEndpoint.create({
      data: { tenantId, source, secret: randomBytes(32).toString('hex') },
      select: { id: true, secret: true, source: true },
    });
  }

  // The signature, the timestamp window and the endpoint's existence were all
  // checked by WebhookSignatureGuard, which is what put the endpoint on the
  // request in the first place. Nothing here re-derives them.
  async receive(input: ReceivedWebhook): Promise<{ eventId: string }> {
    let payload: unknown;

    try {
      payload = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Webhook body must be valid JSON.');
    }

    const event = await authPrismaClient.webhookEvent.create({
      data: {
        endpointId: input.endpoint.id,
        tenantId: input.endpoint.tenantId,
        source: input.endpoint.source,
        payload: payload as object,
      },
      select: { id: true },
    });

    await this.queue.add('webhook.process', { eventId: event.id });

    return { eventId: event.id };
  }
}
