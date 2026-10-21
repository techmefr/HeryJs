import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';

export interface IdempotencyRecord {
  createdAt: Date;
  status: string;
  route: string;
  bodyHash: string;
  statusCode: number | null;
  responseBody: Prisma.JsonValue;
  responseHeaders: Prisma.JsonValue;
}

const SELECT = {
  createdAt: true,
  status: true,
  route: true,
  bodyHash: true,
  statusCode: true,
  responseBody: true,
  responseHeaders: true,
} as const;

@Injectable()
export class IdempotencyKeyStore {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  findRecord(tenantId: string, key: string): Promise<IdempotencyRecord | null> {
    return this.prisma.idempotencyKey.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: SELECT,
    });
  }

  async createPending(
    tenantId: string,
    key: string,
    route: string,
    bodyHash: string,
  ): Promise<void> {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          tenantId,
          key,
          route,
          bodyHash,
          status: 'pending',
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }

      throw error;
    }
  }

  async complete(
    tenantId: string,
    key: string,
    statusCode: number,
    responseBody: unknown,
    responseHeaders: Record<string, string>,
  ): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { tenantId_key: { tenantId, key } },
      data: {
        status: 'completed',
        statusCode,
        responseBody: (responseBody ?? null) as Prisma.InputJsonValue,
        responseHeaders,
      },
    });
  }

  async discard(tenantId: string, key: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({ where: { tenantId, key } });
  }
}
