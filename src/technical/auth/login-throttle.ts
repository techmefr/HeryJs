import { createHash } from 'node:crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';

const FAILURES_PREFIX = 'login-failures:';
const LOCK_PREFIX = 'login-lock:';

function digest(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export class LoginThrottle {
  private client: IORedis | null = null;

  private redis(): IORedis {
    this.client ??= new IORedis(env.REDIS_URL);
    return this.client;
  }

  async lockedForSeconds(email: string): Promise<number> {
    const ttl = await this.redis().ttl(`${LOCK_PREFIX}${digest(email)}`);
    return ttl > 0 ? ttl : 0;
  }

  async recordFailure(email: string): Promise<void> {
    const hash = digest(email);
    const failuresKey = `${FAILURES_PREFIX}${hash}`;
    const count = await this.redis().incr(failuresKey);

    if (count === 1) {
      await this.redis().expire(failuresKey, env.AUTH_LOCKOUT_SECONDS);
    }

    if (count >= env.AUTH_LOCKOUT_MAX_ATTEMPTS) {
      await this.redis().set(
        `${LOCK_PREFIX}${hash}`,
        '1',
        'EX',
        env.AUTH_LOCKOUT_SECONDS,
      );
      await this.redis().del(failuresKey);
    }
  }

  async clear(email: string): Promise<void> {
    await this.redis().del(`${FAILURES_PREFIX}${digest(email)}`);
  }

  async close(): Promise<void> {
    if (!this.client) {
      return;
    }

    const client = this.client;
    this.client = null;
    await client.quit();
  }
}

export const loginThrottle = new LoginThrottle();

@Injectable()
export class LoginThrottleShutdown implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await loginThrottle.close();
  }
}
