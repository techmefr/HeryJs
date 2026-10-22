import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { heryConfig } from '#technical/config/hery-config';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';
import type { PersonalDataSubject } from '#technical/privacy/personal-data.types';

/**
 * A share names two users: the one it was granted to and the one who granted
 * it. Both export it. Erasing the grantee always removes it; erasing the
 * grantor removes it too unless hery.config.ts sets
 * `sharing.onGrantorErasure: 'keep'`, read per erasure.
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
            where: this.erasing(subject),
          })
        ).count,
      eraseTenant: async (tenantId) =>
        (await this.prisma.recordShare.deleteMany({ where: { tenantId } }))
          .count,
    });
  }

  private erasing(subject: PersonalDataSubject) {
    if (heryConfig.sharing?.onGrantorErasure === 'keep') {
      return {
        tenantId: subject.tenantId,
        granteeType: 'user',
        granteeId: subject.userId,
      };
    }

    return this.naming(subject);
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
