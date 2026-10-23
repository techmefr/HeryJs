import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { WebhookSubscription } from '@prisma/client';
import { authPrismaClient } from '@heryjs/core/auth';
import { MAX_SUBSCRIPTIONS_PER_TENANT } from './outbound-webhook.constants';
import type {
  CreateSubscriptionInput,
  RotateSecretInput,
  UpdateSubscriptionInput,
} from './outbound-webhook.dto';
import { outboundWebhookEnv } from './outbound-webhook.env';
import { WebhookNotFoundException } from './webhook-not-found.exception';
import { WebhookRefusedException } from './webhook-refused.exception';
import { WebhookSecretService } from './webhook-secret.service';
import { toSubscriptionView } from './webhook-subscription.view';
import type { WebhookSubscriptionView } from './webhook-subscription.view';
import {
  assertDeliverableUrl,
  WEBHOOK_HOST_RESOLVER,
} from './webhook-url-guard';
import type { WebhookHostResolver } from './webhook-url-guard';

const MS_PER_SECOND = 1000;

export interface MintedSubscription extends WebhookSubscriptionView {
  secret: string;
}

export interface RotatedSecret {
  id: string;
  secret: string;
  previousSecretExpiresAt: Date | null;
}

@Injectable()
export class WebhookSubscriptionService {
  constructor(
    private readonly secrets: WebhookSecretService,
    @Inject(WEBHOOK_HOST_RESOLVER)
    private readonly resolve: WebhookHostResolver,
  ) {}

  async create(
    tenantId: string,
    input: CreateSubscriptionInput,
  ): Promise<MintedSubscription> {
    const held = await authPrismaClient.webhookSubscription.count({
      where: { tenantId },
    });

    if (held >= MAX_SUBSCRIPTIONS_PER_TENANT) {
      throw new WebhookRefusedException('subscription-limit');
    }

    await this.assertUrl(input.url);

    const id = randomUUID();
    const secret = this.secrets.generate();
    const row = await authPrismaClient.webhookSubscription.create({
      data: {
        id,
        tenantId,
        url: input.url,
        description: input.description ?? null,
        events: [...new Set(input.events)],
        secret: this.secrets.seal(secret, id),
      },
    });

    return { ...toSubscriptionView(row), secret };
  }

  async list(tenantId: string): Promise<WebhookSubscriptionView[]> {
    const rows = await authPrismaClient.webhookSubscription.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => toSubscriptionView(row));
  }

  async get(tenantId: string, id: string): Promise<WebhookSubscriptionView> {
    return toSubscriptionView(await this.require(tenantId, id));
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateSubscriptionInput,
  ): Promise<WebhookSubscriptionView> {
    await this.require(tenantId, id);

    if (input.url !== undefined) {
      await this.assertUrl(input.url);
    }

    const row = await authPrismaClient.webhookSubscription.update({
      where: { id },
      data: {
        url: input.url,
        description: input.description,
        active: input.active,
        events: input.events ? [...new Set(input.events)] : undefined,
      },
    });

    return toSubscriptionView(row);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const { count } = await authPrismaClient.webhookSubscription.deleteMany({
      where: { id, tenantId },
    });

    if (count === 0) {
      throw new WebhookNotFoundException('subscription');
    }
  }

  /**
   * The new secret signs from the next attempt on, and the old one is kept as
   * a second signature until the grace window closes. A delivery already queued
   * reads the secrets when it is sent, not when it was queued, so a rotation
   * never leaves an event signed with something the receiver has dropped.
   * Rotating twice inside one window drops the oldest secret: only two are
   * ever honoured.
   */
  async rotate(
    tenantId: string,
    id: string,
    input: RotateSecretInput,
  ): Promise<RotatedSecret> {
    const current = await this.require(tenantId, id);
    const graceSeconds =
      input.graceSeconds ??
      outboundWebhookEnv.WEBHOOK_SECRET_ROTATION_GRACE_SECONDS;
    const previousSecretExpiresAt =
      graceSeconds > 0
        ? new Date(Date.now() + graceSeconds * MS_PER_SECOND)
        : null;
    const secret = this.secrets.generate();

    await authPrismaClient.webhookSubscription.update({
      where: { id },
      data: {
        secret: this.secrets.seal(secret, id),
        previousSecret: previousSecretExpiresAt ? current.secret : null,
        previousSecretExpiresAt,
      },
    });

    return { id, secret, previousSecretExpiresAt };
  }

  /** Every secret a receiver may still be verifying with, newest first. */
  signingSecrets(row: WebhookSubscription, now: Date = new Date()): string[] {
    const secrets = [this.secrets.open(row.secret, row.id)];

    if (
      row.previousSecret !== null &&
      row.previousSecretExpiresAt !== null &&
      row.previousSecretExpiresAt > now
    ) {
      secrets.push(this.secrets.open(row.previousSecret, row.id));
    }

    return secrets;
  }

  private async require(
    tenantId: string,
    id: string,
  ): Promise<WebhookSubscription> {
    const row = await authPrismaClient.webhookSubscription.findFirst({
      where: { id, tenantId },
    });

    if (!row) {
      throw new WebhookNotFoundException('subscription');
    }

    return row;
  }

  private async assertUrl(url: string): Promise<void> {
    await assertDeliverableUrl(
      url,
      this.resolve,
      outboundWebhookEnv.WEBHOOK_ALLOW_PRIVATE_URLS,
    );
  }
}
