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
 * A fixed window, not a sliding one: one transaction per request, which opens
 * the window and counts in the same step, so no failure between the two can
 * leave a counter that never expires. It lets a caller right at a window boundary
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
    const replies = await this.client
      .multi()
      .set(redisKey, 0, 'EX', windowSeconds, 'NX')
      .incr(redisKey)
      .ttl(redisKey)
      .exec();
    const [count, ttl] = countAndTtlOf(replies);
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

function countAndTtlOf(
  replies: [Error | null, unknown][] | null,
): [number, number] {
  const failure = replies?.find(([error]) => error !== null)?.[0];

  if (!replies || failure) {
    throw failure ?? new Error('The rate-limit transaction was discarded.');
  }

  return [Number(replies[1]?.[1]), Number(replies[2]?.[1])];
}
