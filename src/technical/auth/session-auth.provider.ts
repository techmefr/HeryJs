import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '../prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../prisma/prisma.client';
import { InvalidCredentialsException } from '../errors/invalid-credentials.exception';
import { AuthenticatedUser, AuthProvider } from './auth.types';
import { hashPassword, verifyPassword } from './password';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionAuthProvider implements AuthProvider {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async register(email: string, password: string): Promise<AuthenticatedUser> {
    const passwordHash = await hashPassword(password);
    const user = await this.prisma.user.create({
      data: { email, passwordHash },
    });
    return { id: user.id, email: user.email };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; token: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new InvalidCredentialsException();
    }

    const session = await this.prisma.session.create({
      data: {
        token: randomUUID(),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return { user: { id: user.id, email: user.email }, token: session.token };
  }

  async validateSession(token: string): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    return { id: session.user.id, email: session.user.email };
  }
}
