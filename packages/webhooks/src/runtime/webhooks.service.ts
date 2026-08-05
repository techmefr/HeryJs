import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { authPrismaClient } from '#kernel/auth/better-auth.instance';
import { env } from '#kernel/config/env';
import { WEBHOOK_QUEUE } from '#kernel/jobs/jobs.constants';
import { verifyWebhookSignature } from './webhook-signature';
import { InvalidWebhookSignatureException } from './invalid-webhook-signature.exception';

export interface ReceivedWebhook {
  endpointId: string;
  rawBody: Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
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

  async receive(input: ReceivedWebhook): Promise<{ eventId: string }> {
    if (!input.signature || !input.timestamp) {
      throw new InvalidWebhookSignatureException();
    }

    const endpoint = await authPrismaClient.webhookEndpoint.findUnique({
      where: { id: input.endpointId },
    });

    // Rejecting an unknown endpoint id with the exact same exception as a bad
    // signature keeps the two indistinguishable from the outside -- a probe
    // for real endpoint ids gets nothing back that a probe for real
    // signatures wouldn't also get.
    if (!endpoint || !endpoint.active) {
      throw new InvalidWebhookSignatureException();
    }

    const valid = verifyWebhookSignature({
      secret: endpoint.secret,
      timestamp: input.timestamp,
      rawBody: input.rawBody,
      signature: input.signature,
      toleranceSeconds: env.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
    });

    if (!valid) {
      throw new InvalidWebhookSignatureException();
    }

    let payload: unknown;

    try {
      payload = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Webhook body must be valid JSON.');
    }

    const event = await authPrismaClient.webhookEvent.create({
      data: {
        endpointId: endpoint.id,
        tenantId: endpoint.tenantId,
        source: endpoint.source,
        payload: payload as object,
      },
      select: { id: true },
    });

    await this.queue.add('webhook.process', { eventId: event.id });

    return { eventId: event.id };
  }
}
