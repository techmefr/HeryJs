import { Injectable, OnModuleInit } from '@nestjs/common';
import { authPrismaClient } from '@heryjs/core/auth';
import { PersonalDataRegistry } from '@heryjs/core/privacy';

/**
 * The link between an account and the subject an identity provider knows it
 * by.
 */
@Injectable()
export class SsoPersonalData implements OnModuleInit {
  constructor(private readonly registry: PersonalDataRegistry) {}

  onModuleInit(): void {
    this.registry.registerHook({
      name: 'SsoIdentity',
      models: ['SsoIdentity'],
      exportUser: (subject) =>
        authPrismaClient.ssoIdentity.findMany({
          where: { tenantId: subject.tenantId, userId: subject.userId },
          select: { connectionId: true, subject: true, createdAt: true },
        }),
      eraseUser: async (subject) =>
        (
          await authPrismaClient.ssoIdentity.deleteMany({
            where: { tenantId: subject.tenantId, userId: subject.userId },
          })
        ).count,
      eraseTenant: async (tenantId, keptUserId) =>
        (
          await authPrismaClient.ssoIdentity.deleteMany({
            where: {
              tenantId,
              ...(keptUserId === null ? {} : { userId: { not: keptUserId } }),
            },
          })
        ).count,
    });
  }
}
