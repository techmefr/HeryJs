import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type AuthenticatedUser,
  authPrismaClient,
} from '#technical/public/auth';
import { subjectOf } from '#technical/public/capabilities';
import { CapabilityForbiddenException } from '#technical/public/errors';
import { ExpositionRegistry } from '#technical/public/platform';
import { stageOutboxMessages } from '#technical/public/jobs';
import { exposedActionOf } from './exposed-webhook-source';
import {
  INBOUND_WEBHOOK_MESSAGE,
  MAX_DELIVERY_ID_LENGTH,
} from './inbound-webhook.constants';
import { InboundWebhookRelay } from './inbound-webhook.relay';
import { WebhookEndpointSecretService } from './webhook-endpoint-secret.service';
import {
  WebhookActionNotExposedException,
  WebhookBodyInvalidException,
} from './webhook-input.exceptions';
import type { VerifiedWebhookEndpoint } from './webhook-signature.guard';

export interface ReceivedWebhook {
  endpoint: VerifiedWebhookEndpoint;
  rawBody: Buffer;
  deliveryId: string | null;
  timestamp: string;
}

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly actions: ExpositionRegistry,
    private readonly secrets: WebhookEndpointSecretService,
    private readonly relay: InboundWebhookRelay,
  ) {}

  async createEndpoint(user: AuthenticatedUser, source: string) {
    this.assertBindable(user, source);

    const id = randomUUID();
    const secret = this.secrets.generate();
    const endpoint = await authPrismaClient.webhookEndpoint.create({
      data: {
        id,
        tenantId: user.tenantId,
        source,
        secret: this.secrets.seal(secret, id),
      },
      select: { id: true, source: true },
    });

    return { id: endpoint.id, secret, source: endpoint.source };
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
  //
  // A sender retries until it sees a 2xx, so the same event arrives more than
  // once: it is keyed on the sender's own delivery id, or on a hash of the
  // signed bytes when the sender sends none, and a second arrival answers with
  // the event already recorded. The event and its outbox message are one
  // write: the job is queued right away, and by the relay if Redis is down.
  async receive(input: ReceivedWebhook): Promise<{ eventId: string }> {
    let payload: unknown;

    try {
      payload = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      throw new WebhookBodyInvalidException();
    }

    const deliveryId = this.deliveryIdOf(input);

    let eventId: string;

    try {
      eventId = await authPrismaClient.$transaction(async (tx) => {
        const event = await tx.webhookEvent.create({
          data: {
            endpointId: input.endpoint.id,
            tenantId: input.endpoint.tenantId,
            source: input.endpoint.source,
            deliveryId,
            payload: payload as object,
          },
          select: { id: true },
        });

        await stageOutboxMessages(tx, [
          {
            name: INBOUND_WEBHOOK_MESSAGE,
            payload: { eventId: event.id },
            tenantId: input.endpoint.tenantId,
          },
        ]);

        return event.id;
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== UNIQUE_VIOLATION
      ) {
        throw error;
      }

      const recorded = await authPrismaClient.webhookEvent.findUniqueOrThrow({
        where: {
          tenantId_endpointId_deliveryId: {
            tenantId: input.endpoint.tenantId,
            endpointId: input.endpoint.id,
            deliveryId,
          },
        },
        select: { id: true },
      });

      return { eventId: recorded.id };
    }

    try {
      await this.relay.enqueue(eventId);
    } catch (error) {
      this.logger.warn(
        `Webhook event ${eventId} is left to the outbox relay: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return { eventId };
  }

  private deliveryIdOf(input: ReceivedWebhook): string {
    if (input.deliveryId === null || input.deliveryId === '') {
      return `sha256:${createHash('sha256')
        .update(input.timestamp)
        .update('.')
        .update(input.rawBody)
        .digest('hex')}`;
    }

    if (input.deliveryId.length > MAX_DELIVERY_ID_LENGTH) {
      throw new WebhookBodyInvalidException();
    }

    return `id:${input.deliveryId}`;
  }
}
