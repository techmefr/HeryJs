import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { AuthenticatedUser } from '#technical/auth/auth.types';
import { subjectOf } from '#technical/capabilities/subject';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { ExpositionRegistry } from '#technical/exposition/exposition.registry';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { WEBHOOK_QUEUE } from '#technical/jobs/jobs.constants';
import { exposedActionOf } from './exposed-webhook-source';
import {
  WebhookActionNotExposedException,
  WebhookBodyInvalidException,
} from './webhook-input.exceptions';
import type { VerifiedWebhookEndpoint } from './webhook-signature.guard';

export interface ReceivedWebhook {
  endpoint: VerifiedWebhookEndpoint;
  rawBody: Buffer;
}

@Injectable()
export class WebhooksService {
  constructor(
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue,
    private readonly actions: ExpositionRegistry,
  ) {}

  createEndpoint(user: AuthenticatedUser, source: string) {
    this.assertBindable(user, source);

    return authPrismaClient.webhookEndpoint.create({
      data: {
        tenantId: user.tenantId,
        source,
        secret: randomBytes(32).toString('hex'),
      },
      select: { id: true, secret: true, source: true },
    });
  }

  // An endpoint whose source names an exposed action is a door to that action
  // for anyone holding the secret, so minting one is held to the action's own
  // capability as well as to canManageWebhooks: an admin cannot hand out a way
  // to run something they could not run themselves. Only an action that opted in
  // with `webhook: true` can be bound at all.
  private assertBindable(user: AuthenticatedUser, source: string): void {
    const actionName = exposedActionOf(source);

    if (actionName === null) {
      return;
    }

    const action = this.actions.get(actionName);

    if (!action || action.triggers?.webhook !== true) {
      throw new WebhookActionNotExposedException(actionName);
    }

    const decision = action.capability(subjectOf(user));

    if (!decision.allowed) {
      throw new CapabilityForbiddenException(decision);
    }
  }

  // The signature, the timestamp window and the endpoint's existence were all
  // checked by WebhookSignatureGuard, which is what put the endpoint on the
  // request in the first place. Nothing here re-derives them.
  async receive(input: ReceivedWebhook): Promise<{ eventId: string }> {
    let payload: unknown;

    try {
      payload = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      throw new WebhookBodyInvalidException();
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
