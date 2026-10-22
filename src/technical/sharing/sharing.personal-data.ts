import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';
import type { PersonalDataSubject } from '#technical/privacy/personal-data.types';

/**
 * A share names two users: the one it was granted to and the one who granted
 * it. Both go with either of them.
 */
@Injectable()
export class SharingPersonalData implements OnModuleInit {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly registry: PersonalDataRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerHook({
      name: 'RecordShare',
      models: ['RecordShare'],
      exportUser: (subject) =>
        this.prisma.recordShare.findMany({
          where: this.naming(subject),
          orderBy: { createdAt: 'asc' },
          select: {
            resource: true,
            recordId: true,
            granteeType: true,
            granteeId: true,
            access: true,
            grantedById: true,
            createdAt: true,
          },
        }),
      eraseUser: async (subject) =>
        (
          await this.prisma.recordShare.deleteMany({
            where: this.naming(subject),
          })
        ).count,
      eraseTenant: async (tenantId) =>
        (await this.prisma.recordShare.deleteMany({ where: { tenantId } }))
          .count,
    });
  }

  private naming(subject: PersonalDataSubject) {
    return {
      tenantId: subject.tenantId,
      OR: [
        { granteeType: 'user', granteeId: subject.userId },
        { grantedById: subject.userId },
      ],
    };
  }
}
