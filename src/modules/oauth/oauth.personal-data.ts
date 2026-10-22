import { Injectable, OnModuleInit } from '@nestjs/common';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';

/**
 * The link between an account and its provider identity, with the address the
 * provider reported. It carries no tenant, so a tenant erasure finds it through
 * the tenant's accounts.
 */
@Injectable()
export class OAuthPersonalData implements OnModuleInit {
  constructor(private readonly registry: PersonalDataRegistry) {}

  onModuleInit(): void {
    this.registry.registerHook({
      name: 'OauthIdentity',
      models: ['OauthIdentity'],
      exportUser: (subject) =>
        authPrismaClient.oauthIdentity.findMany({
          where: { userId: subject.userId },
          select: {
            provider: true,
            providerUserId: true,
            email: true,
            createdAt: true,
          },
        }),
      eraseUser: async (subject) =>
        (
          await authPrismaClient.oauthIdentity.deleteMany({
            where: { userId: subject.userId },
          })
        ).count,
      eraseTenant: async (tenantId, keptUserId) => {
        const users = await authPrismaClient.user.findMany({
          where: {
            tenantId,
            ...(keptUserId === null ? {} : { id: { not: keptUserId } }),
          },
          select: { id: true },
        });

        return (
          await authPrismaClient.oauthIdentity.deleteMany({
            where: { userId: { in: users.map((user) => user.id) } },
          })
        ).count;
      },
    });
  }
}
