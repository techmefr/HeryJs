import { Controller, Get, Post } from '@nestjs/common';
import { AdminAction, AdminSection } from '#technical/admin/admin-metadata';
import { AdminStudio } from '#technical/admin/admin-studio.guard';
import { CacheService } from '#technical/cache/cache.service';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { OUTPUT_CACHE_PREFIX } from './output-cache-key';
import { canFlushOutputCache, canReadOutputCache } from './output-cache.policy';
import { OutputCacheStats } from './output-cache.stats';

@Controller('output-cache')
@AdminStudio()
export class OutputCacheAdminController {
  constructor(
    private readonly stats: OutputCacheStats,
    private readonly cache: CacheService,
  ) {}

  @AdminSection({
    id: 'output-cache-routes',
    title: 'Output cache',
    icon: 'zap',
    group: 'Performance',
    order: 1,
    columns: [
      { key: 'route', label: 'Route' },
      { key: 'models', label: 'Invalidated by' },
      { key: 'ttlSeconds', label: 'TTL (s)', format: 'number' },
      { key: 'hits', label: 'Hits', format: 'number' },
      { key: 'misses', label: 'Misses', format: 'number' },
    ],
  })
  @RateLimit('read')
  @UnpaginatedRoute(
    'one row per @CacheOutput route this process has served, a list the code itself bounds',
  )
  @Get('routes')
  @Capability(canReadOutputCache)
  routes() {
    return ok(this.stats.list());
  }

  @RateLimit('write')
  @AdminAction({
    id: 'output-cache-flush',
    title: 'Flush output cache',
    icon: 'zap',
    section: 'output-cache-routes',
    scope: 'global',
    confirm: 'Drop every cached response of this tenant?',
  })
  @Post('flush')
  @Capability(canFlushOutputCache)
  async flush() {
    await this.cache.invalidate(OUTPUT_CACHE_PREFIX);

    return ok({ flushed: true }, ['Output cache flushed.']);
  }
}
