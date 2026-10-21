import { Injectable } from '@nestjs/common';
import { Counter } from '@prometheus-io/client';
import { metricsRegistry } from '#technical/monitoring/metrics.registry';

export type OutputCacheResult = 'hit' | 'miss';

export interface OutputCacheRouteStats {
  route: string;
  models: string;
  ttlSeconds: number;
  hits: number;
  misses: number;
}

export const outputCacheRequestsTotal = new Counter({
  name: 'http_output_cache_requests_total',
  help: 'Reads served by a @CacheOutput route, by result',
  labelNames: ['route', 'result'],
  registers: [metricsRegistry],
});

/**
 * Counts per route pattern, never per URL, for the same reason the request
 * metrics do. The Prometheus counter is what a scrape reads; the map is what
 * the admin section lists, and like the counter it is this process's view.
 */
@Injectable()
export class OutputCacheStats {
  private readonly routes = new Map<string, OutputCacheRouteStats>();

  record(
    route: string,
    models: string[],
    ttlSeconds: number,
    result: OutputCacheResult,
  ): void {
    const entry = this.routes.get(route) ?? {
      route,
      models: [...models].sort().join(', '),
      ttlSeconds,
      hits: 0,
      misses: 0,
    };

    if (result === 'hit') {
      entry.hits += 1;
    } else {
      entry.misses += 1;
    }

    this.routes.set(route, entry);
    outputCacheRequestsTotal.inc({ route, result });
  }

  list(): OutputCacheRouteStats[] {
    return [...this.routes.values()]
      .sort((first, second) => first.route.localeCompare(second.route))
      .map((entry) => ({ ...entry }));
  }
}
