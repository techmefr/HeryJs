import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';

export const OAUTH_IDENTITY_STORE = Symbol('OAUTH_IDENTITY_STORE');

const UNIQUE_VIOLATION = 'P2002';

export interface OAuthLocalUser {
  id: string;
  email: string;
  isEmailVerified: boolean;
  isBanned: boolean;
}

export interface OAuthNewUser {
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface OAuthIdentityStore {
  findLinkedUserId(
    provider: string,
    providerUserId: string,
  ): Promise<string | null>;
  findUser(id: string): Promise<OAuthLocalUser | null>;
  findUserByEmail(email: string): Promise<OAuthLocalUser | null>;
  createUser(user: OAuthNewUser): Promise<OAuthLocalUser | null>;
  linkIdentity(
    provider: string,
    providerUserId: string,
    userId: string,
    email: string | null,
  ): Promise<boolean>;
  removeIdentity(provider: string, providerUserId: string): Promise<void>;
}

interface UserRow {
  id: string;
  email: string;
  emailVerified: boolean;
  banned: boolean;
}

function toLocalUser(row: UserRow): OAuthLocalUser {
  return {
    id: row.id,
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
export class PrismaOAuthIdentityStore implements OAuthIdentityStore {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async findLinkedUserId(
    provider: string,
    providerUserId: string,
  ): Promise<string | null> {
    const identity = await this.prisma.oauthIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      select: { userId: true },
    });

    return identity ? identity.userId : null;
  }

  async findUser(id: string): Promise<OAuthLocalUser | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });

    return row ? toLocalUser(row) : null;
  }

  async findUserByEmail(email: string): Promise<OAuthLocalUser | null> {
    const row = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    return row ? toLocalUser(row) : null;
  }

  async createUser(user: OAuthNewUser): Promise<OAuthLocalUser | null> {
    try {
      const row = await this.prisma.user.create({
        data: {
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
    provider: string,
    providerUserId: string,
    userId: string,
    email: string | null,
  ): Promise<boolean> {
    try {
      await this.prisma.oauthIdentity.create({
        data: { provider, providerUserId, userId, email },
      });

      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }

      throw error;
    }
  }

  async removeIdentity(
    provider: string,
    providerUserId: string,
  ): Promise<void> {
    await this.prisma.oauthIdentity.deleteMany({
      where: { provider, providerUserId },
    });
  }
}
