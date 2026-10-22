import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { PRISMA_CLIENT } from '#kernel/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#kernel/prisma/prisma.client';
import { PersonalDataRegistry } from '#kernel/privacy/personal-data.registry';

/**
 * The directory's own copy of a user's name and external id, kept beside the
 * account rather than on it.
 */
@Injectable()
export class ScimPersonalData implements OnModuleInit {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly registry: PersonalDataRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerHook({
      name: 'ScimIdentity',
      models: ['ScimIdentity'],
      exportUser: (subject) =>
        this.prisma.scimIdentity.findMany({
          where: {
            tenantId: subject.tenantId,
            kind: 'user',
            resourceId: subject.userId,
          },
          select: {
            externalId: true,
            givenName: true,
            familyName: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      eraseUser: async (subject) =>
        (
          await this.prisma.scimIdentity.deleteMany({
            where: {
              tenantId: subject.tenantId,
              kind: 'user',
              resourceId: subject.userId,
            },
          })
        ).count,
      eraseTenant: async (tenantId) =>
        (await this.prisma.scimIdentity.deleteMany({ where: { tenantId } }))
          .count,
    });
  }
}
