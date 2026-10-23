import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  PRISMA_CLIENT,
  type TenantScopedPrismaClient,
} from '#kernel/public/database';
import {
  PersonalDataRegistry,
  type PersonalDataSubject,
} from '#kernel/public/privacy';

/**
 * A mail log names its recipient by address, not by account, so the rows of a
 * user are the ones sent to the address the account holds.
 */
@Injectable()
export class MailPersonalData implements OnModuleInit {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly registry: PersonalDataRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerHook({
      name: 'MailLog',
      models: ['MailLog'],
      exportUser: (subject) =>
        this.prisma.mailLog.findMany({
          where: this.sentTo(subject),
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            to: true,
            subject: true,
            status: true,
            createdAt: true,
            sentAt: true,
          },
        }),
      eraseUser: async (subject) =>
        (await this.prisma.mailLog.deleteMany({ where: this.sentTo(subject) }))
          .count,
      eraseTenant: async (tenantId) =>
        (await this.prisma.mailLog.deleteMany({ where: { tenantId } })).count,
    });
  }

  private sentTo(subject: PersonalDataSubject) {
    return {
      tenantId: subject.tenantId,
      to: { equals: subject.email, mode: 'insensitive' as const },
    };
  }
}
