import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { mentionsSubject } from '#technical/privacy/personal-data.match';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';
import type { PersonalDataSubject } from '#technical/privacy/personal-data.types';
import { addPersonalLogFields } from './log-redaction';

/**
 * A log line is free text, so a user's lines are the ones whose message or
 * fields name the user's id or address.
 */
@Injectable()
export class LogPersonalData implements OnModuleInit, OnApplicationBootstrap {
  constructor(private readonly registry: PersonalDataRegistry) {}

  onModuleInit(): void {
    this.registry.registerHook({
      name: 'LogEntry',
      models: ['LogEntry'],
      exportUser: (subject) =>
        authPrismaClient.$queryRaw<
          unknown[]
        >`SELECT "id", "level", "message", "fields", "loggedAt" FROM "LogEntry" WHERE "tenantId" = ${subject.tenantId} AND (${this.logEntryMentions(subject)}) ORDER BY "loggedAt" ASC`,
      eraseUser: (subject) =>
        authPrismaClient.$executeRaw`DELETE FROM "LogEntry" WHERE "tenantId" = ${subject.tenantId} AND (${this.logEntryMentions(subject)})`,
      eraseTenant: (tenantId) =>
        authPrismaClient.$executeRaw`DELETE FROM "LogEntry" WHERE "tenantId" = ${tenantId}`,
    });
  }

  onApplicationBootstrap(): void {
    addPersonalLogFields(
      this.registry
        .all()
        .flatMap((declaration) => declaration.fields)
        .filter((field) => field.personal)
        .map((field) => field.name),
    );
  }

  private logEntryMentions(subject: PersonalDataSubject): Prisma.Sql {
    return Prisma.join(
      [mentionsSubject('message', subject), mentionsSubject('fields', subject)],
      ' OR ',
    );
  }
}
