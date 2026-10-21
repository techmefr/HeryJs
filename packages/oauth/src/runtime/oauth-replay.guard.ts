import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '#kernel/config/env';

export const OAUTH_REPLAY_GUARD = Symbol('OAUTH_REPLAY_GUARD');

export interface OAuthReplayGuard {
  consume(state: string, ttlSeconds: number): Promise<boolean>;
}

const KEY_PREFIX = 'oauth:state:';

@Injectable()
export class ValkeyOAuthReplayGuard
  implements OAuthReplayGuard, OnModuleDestroy
{
  private readonly client = new IORedis(env.REDIS_URL, { lazyConnect: true });

  async consume(state: string, ttlSeconds: number): Promise<boolean> {
    const stored = await this.client.set(
      `${KEY_PREFIX}${state}`,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );

    return stored === 'OK';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit().catch(() => undefined);
    }
  }
}
