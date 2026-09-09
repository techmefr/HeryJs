import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';

const KEY_PREFIX = 'rate-limit:';

export interface RateLimitHit {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * A fixed window, not a sliding one: one round trip per request, and a second
 * only on the window's first hit. It lets a caller right at a window boundary
 * fire close to twice its stated limit in quick succession -- accepted, since
 * the alternative costs every request a second round trip to keep a sorted
 * set trimmed, for a guard whose job is to blunt abuse, not meter it exactly.
 */
@Injectable()
export class RateLimitStore implements OnModuleDestroy {
  private readonly client = new IORedis(env.REDIS_URL);

  async hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitHit> {
    const redisKey = `${KEY_PREFIX}${key}`;
    const count = await this.client.incr(redisKey);

    if (count === 1) {
      await this.client.expire(redisKey, windowSeconds);
    }

    const ttl = await this.client.ttl(redisKey);
    const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
