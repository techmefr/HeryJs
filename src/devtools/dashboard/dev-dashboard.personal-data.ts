import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { mentionsSubject } from '#technical/privacy/personal-data.match';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';
import type { PersonalDataSubject } from '#technical/privacy/personal-data.types';

/**
 * What the dashboard recorded about a request or a job: a user's entries are
 * the ones whose label or detail name the user's id or address.
 */
@Injectable()
export class DevDashboardPersonalData implements OnModuleInit {
  constructor(private readonly registry: PersonalDataRegistry) {}

  onModuleInit(): void {
    this.registry.registerHook({
      name: 'DevtoolsEntry',
      models: ['DevtoolsEntry'],
      exportUser: (subject) =>
        authPrismaClient.$queryRaw<
          unknown[]
        >`SELECT "id", "kind", "label", "detail", "createdAt" FROM "DevtoolsEntry" WHERE "tenantId" = ${subject.tenantId} AND (${this.devtoolsEntryMentions(subject)}) ORDER BY "createdAt" ASC`,
      eraseUser: (subject) =>
        authPrismaClient.$executeRaw`DELETE FROM "DevtoolsEntry" WHERE "tenantId" = ${subject.tenantId} AND (${this.devtoolsEntryMentions(subject)})`,
      eraseTenant: (tenantId) =>
        authPrismaClient.$executeRaw`DELETE FROM "DevtoolsEntry" WHERE "tenantId" = ${tenantId}`,
    });
  }

  private devtoolsEntryMentions(subject: PersonalDataSubject): Prisma.Sql {
    return Prisma.join(
      [mentionsSubject('label', subject), mentionsSubject('detail', subject)],
      ' OR ',
    );
  }
}
