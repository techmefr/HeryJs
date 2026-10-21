import { Injectable } from '@nestjs/common';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import type { ScimTokenRecord, ScimTokenStore } from './scim-token.service';

@Injectable()
export class PrismaScimTokenStore implements ScimTokenStore {
  findByHash(tokenHash: string): Promise<ScimTokenRecord | null> {
    return authPrismaClient.scimToken.findUnique({ where: { tokenHash } });
  }

  findByTenant(tenantId: string): Promise<ScimTokenRecord | null> {
    return authPrismaClient.scimToken.findUnique({ where: { tenantId } });
  }

  replace(
    tenantId: string,
    token: { tokenHash: string; prefix: string },
  ): Promise<ScimTokenRecord> {
    return authPrismaClient.scimToken.upsert({
      where: { tenantId },
      create: { tenantId, ...token },
      update: { ...token, rotatedAt: new Date(), lastUsedAt: null },
    });
  }

  async remove(tenantId: string): Promise<boolean> {
    const result = await authPrismaClient.scimToken.deleteMany({
      where: { tenantId },
    });

    return result.count > 0;
  }

  async touch(id: string, at: Date): Promise<void> {
    await authPrismaClient.scimToken.updateMany({
      where: { id },
      data: { lastUsedAt: at },
    });
  }
}
