import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { authPrismaClient } from './better-auth.instance';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import type { Page, PageQuery } from '#technical/http/page-query';
import type { AuthenticatedUser } from './auth.types';

const KEY_PREFIX = 'hery_ak_';

function hash(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export interface CreatedApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: Date;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * Every non-interactive caller (CI, scripts) needs a credential that never
 * expires on its own and never depends on a login flow -- a bearer token
 * scoped to the same user a session would resolve to, distinguished from one
 * by its prefix alone so SessionGuard can route either to the right check.
 * The raw key is only ever returned once, at creation: everything after that
 * stores just its hash plus a public lookup prefix, the same shape as GitHub
 * or Stripe's own API keys.
 */
@Injectable()
export class ApiKeyService {
  static isApiKey(token: string): boolean {
    return token.startsWith(KEY_PREFIX);
  }

  async create(user: AuthenticatedUser, name: string): Promise<CreatedApiKey> {
    const secret = randomBytes(24).toString('base64url');
    const lookupPrefix = randomBytes(6).toString('base64url');
    const rawKey = `${KEY_PREFIX}${lookupPrefix}.${secret}`;

    const created = await authPrismaClient.apiKey.create({
      data: {
        userId: user.id,
        name,
        prefix: lookupPrefix,
        hashedKey: hash(rawKey),
      },
    });

    return {
      id: created.id,
      name: created.name,
      key: rawKey,
      createdAt: created.createdAt,
    };
  }

  async list(
    user: AuthenticatedUser,
    page: PageQuery,
  ): Promise<Page<ApiKeySummary>> {
    const where = { userId: user.id };

    // The id breaks a createdAt tie, so the order is the same on every request
    // and a key cannot land on two pages or on none.
    const [keys, total] = await Promise.all([
      authPrismaClient.apiKey.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      authPrismaClient.apiKey.count({ where }),
    ]);

    return {
      records: keys.map((key) => ({
        id: key.id,
        name: key.name,
        createdAt: key.createdAt,
        revokedAt: key.revokedAt,
      })),
      total,
    };
  }

  async revoke(user: AuthenticatedUser, id: string): Promise<void> {
    const key = await authPrismaClient.apiKey.findUnique({ where: { id } });

    if (!key || key.userId !== user.id) {
      throw new RecordNotFoundException('apiKey');
    }

    await authPrismaClient.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async validate(
    rawKey: string,
  ): Promise<{ id: string; email: string } | null> {
    const body = rawKey.slice(KEY_PREFIX.length);
    const lookupPrefix = body.split('.')[0];

    if (!lookupPrefix) {
      return null;
    }

    const key = await authPrismaClient.apiKey.findUnique({
      where: { prefix: lookupPrefix },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!key || key.revokedAt) {
      return null;
    }

    const expected = Buffer.from(key.hashedKey);
    const actual = Buffer.from(hash(rawKey));

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return null;
    }

    return { id: key.user.id, email: key.user.email };
  }
}
