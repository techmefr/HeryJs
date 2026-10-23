import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authPrismaClient } from '#kernel/public/auth';
import {
  mentionsSubject,
  PersonalDataRegistry,
  type PersonalDataSubject,
} from '#kernel/public/privacy';

/**
 * A webhook payload is whatever the event carried, so a user's rows are the
 * ones whose payload names the user's id or address, sent or received.
 */
@Injectable()
export class WebhooksPersonalData implements OnModuleInit {
  constructor(private readonly registry: PersonalDataRegistry) {}

  onModuleInit(): void {
    this.registry.registerHook({
      name: 'WebhookDelivery',
      models: ['WebhookDelivery'],
      exportUser: (subject) =>
        authPrismaClient.$queryRaw<
          unknown[]
        >`SELECT "id", "event", "payload", "status", "createdAt" FROM "WebhookDelivery" WHERE "tenantId" = ${subject.tenantId} AND (${this.webhookDeliveryMentions(subject)}) ORDER BY "createdAt" ASC`,
      eraseUser: (subject) =>
        authPrismaClient.$executeRaw`DELETE FROM "WebhookDelivery" WHERE "tenantId" = ${subject.tenantId} AND (${this.webhookDeliveryMentions(subject)})`,
      eraseTenant: (tenantId) =>
        authPrismaClient.$executeRaw`DELETE FROM "WebhookDelivery" WHERE "tenantId" = ${tenantId}`,
    });
    this.registry.registerHook({
      name: 'WebhookEvent',
      models: ['WebhookEvent'],
      exportUser: (subject) =>
        authPrismaClient.$queryRaw<
          unknown[]
        >`SELECT "id", "source", "payload", "receivedAt" FROM "WebhookEvent" WHERE "tenantId" = ${subject.tenantId} AND (${this.webhookEventMentions(subject)}) ORDER BY "receivedAt" ASC`,
      eraseUser: (subject) =>
        authPrismaClient.$executeRaw`DELETE FROM "WebhookEvent" WHERE "tenantId" = ${subject.tenantId} AND (${this.webhookEventMentions(subject)})`,
      eraseTenant: (tenantId) =>
        authPrismaClient.$executeRaw`DELETE FROM "WebhookEvent" WHERE "tenantId" = ${tenantId}`,
    });
  }

  private webhookDeliveryMentions(subject: PersonalDataSubject): Prisma.Sql {
    return Prisma.join([mentionsSubject('payload', subject)], ' OR ');
  }

  private webhookEventMentions(subject: PersonalDataSubject): Prisma.Sql {
    return Prisma.join([mentionsSubject('payload', subject)], ' OR ');
  }
}
