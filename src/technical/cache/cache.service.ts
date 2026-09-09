import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from '#technical/config/env';
import { heryConfig } from '#technical/config/hery-config';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';

const KEY_PREFIX = 'cache:';
const DEFAULT_TTL_SECONDS = 300;

/**
 * Every key is namespaced under the calling tenant, the same way a query
 * against a tenant-scoped model is: a cache that skipped this would leak one
 * tenant's data into another's response the moment their cache keys collided,
 * which they will the instant two projects share a resource name.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly client = new IORedis(env.REDIS_URL);

  private key(key: string): string {
    return `${KEY_PREFIX}${TenantContextStorage.getTenantId()}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(this.key(key));

    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds: number = heryConfig.cache?.defaultTtlSeconds ??
      DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    await this.client.set(
      this.key(key),
      JSON.stringify(value),
      'EX',
      ttlSeconds,
    );
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }

  /**
   * Drops every entry under one tenant whose key starts with `prefix`, so a
   * resource can clear what it wrote without knowing what else shares the
   * tenant's namespace. A cursor scan rather than KEYS: KEYS blocks the whole
   * server for as long as the scan takes, which is fine against a handful of
   * keys in development and a production incident against a real keyspace.
   */
  async invalidate(prefix: string): Promise<void> {
    const pattern = this.key(`${prefix}*`);
    const stream = this.client.scanStream({ match: pattern, count: 100 });
    const found: string[] = [];

    for await (const keys of stream as AsyncIterable<string[]>) {
      found.push(...keys);
    }

    if (found.length > 0) {
      await this.client.del(...found);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
