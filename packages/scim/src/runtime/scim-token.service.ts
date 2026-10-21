import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SCIM_TOKEN_STORE } from './scim.types';
import type { ScimCaller } from './scim.types';

const TOKEN_PREFIX = 'scim_';
const TOKEN_BYTES = 32;
const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 4;
const TOUCH_INTERVAL_MS = 60_000;

export interface ScimTokenRecord {
  id: string;
  tenantId: string;
  tokenHash: string;
  prefix: string;
  createdAt: Date;
  rotatedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface ScimTokenStore {
  findByHash(tokenHash: string): Promise<ScimTokenRecord | null>;
  findByTenant(tenantId: string): Promise<ScimTokenRecord | null>;
  replace(
    tenantId: string,
    token: { tokenHash: string; prefix: string },
  ): Promise<ScimTokenRecord>;
  remove(tenantId: string): Promise<boolean>;
  touch(id: string, at: Date): Promise<void>;
}

export interface ScimTokenView {
  isConfigured: boolean;
  prefix: string | null;
  createdAt: Date | null;
  rotatedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface ScimIssuedToken {
  token: string;
  status: ScimTokenView;
}

/** The token is high-entropy and random, so a plain SHA-256 is what is stored: there is nothing to brute-force, and it can be looked up by value. */
export function hashScimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toView(record: ScimTokenRecord | null): ScimTokenView {
  return {
    isConfigured: record !== null,
    prefix: record?.prefix ?? null,
    createdAt: record?.createdAt ?? null,
    rotatedAt: record?.rotatedAt ?? null,
    lastUsedAt: record?.lastUsedAt ?? null,
  };
}

/**
 * One bearer token per tenant: the directory the tenant connects is the one
 * credential, and replacing it is how it is rotated -- the previous token stops
 * working the moment the new one is issued. Only a hash is kept, so the token
 * is shown once, when it is issued.
 */
@Injectable()
export class ScimTokenService {
  constructor(@Inject(SCIM_TOKEN_STORE) private readonly store: ScimTokenStore) {}

  async issue(tenantId: string): Promise<ScimIssuedToken> {
    const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
    const record = await this.store.replace(tenantId, {
      tokenHash: hashScimToken(token),
      prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
    });

    return { token, status: toView(record) };
  }

  async status(tenantId: string): Promise<ScimTokenView> {
    return toView(await this.store.findByTenant(tenantId));
  }

  revoke(tenantId: string): Promise<boolean> {
    return this.store.remove(tenantId);
  }

  async authenticate(header: string | undefined): Promise<ScimCaller | null> {
    const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');

    if (!match?.[1] || !match[1].startsWith(TOKEN_PREFIX)) {
      return null;
    }

    const record = await this.store.findByHash(hashScimToken(match[1]));

    if (!record) {
      return null;
    }

    const now = new Date();

    if (
      !record.lastUsedAt ||
      now.getTime() - record.lastUsedAt.getTime() > TOUCH_INTERVAL_MS
    ) {
      await this.store.touch(record.id, now);
    }

    return { tenantId: record.tenantId, tokenId: record.id };
  }
}
