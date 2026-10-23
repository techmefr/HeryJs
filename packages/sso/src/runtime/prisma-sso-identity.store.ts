import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authPrismaClient } from '#kernel/public/auth';
import type {
  SsoIdentityStore,
  SsoLocalUser,
  SsoNewUser,
} from './sso-identity.store';

const UNIQUE_VIOLATION = 'P2002';

interface UserRow {
  id: string;
  tenantId: string;
  email: string;
  emailVerified: boolean;
  banned: boolean;
}

function toLocalUser(row: UserRow): SsoLocalUser {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    isEmailVerified: row.emailVerified,
    isBanned: row.banned,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}

@Injectable()
export class PrismaSsoIdentityStore implements SsoIdentityStore {
  async findLinkedUserId(
    connectionId: string,
    subject: string,
  ): Promise<string | null> {
    const identity = await authPrismaClient.ssoIdentity.findUnique({
      where: { connectionId_subject: { connectionId, subject } },
      select: { userId: true },
    });

    return identity ? identity.userId : null;
  }

  async findUser(id: string): Promise<SsoLocalUser | null> {
    const row = await authPrismaClient.user.findUnique({ where: { id } });

    return row ? toLocalUser(row) : null;
  }

  async findUserByEmail(email: string): Promise<SsoLocalUser | null> {
    const row = await authPrismaClient.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    return row ? toLocalUser(row) : null;
  }

  async createUser(user: SsoNewUser): Promise<SsoLocalUser | null> {
    try {
      const row = await authPrismaClient.user.create({
        data: {
          tenantId: user.tenantId,
          email: user.email.toLowerCase(),
          emailVerified: true,
          name: user.name,
          image: user.avatarUrl,
        },
      });

      return toLocalUser(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  async linkIdentity(
    tenantId: string,
    connectionId: string,
    subject: string,
    userId: string,
  ): Promise<boolean> {
    try {
      await authPrismaClient.ssoIdentity.create({
        data: { tenantId, connectionId, subject, userId },
      });

      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }

      throw error;
    }
  }

  async removeIdentity(connectionId: string, subject: string): Promise<void> {
    await authPrismaClient.ssoIdentity.deleteMany({
      where: { connectionId, subject },
    });
  }
}
