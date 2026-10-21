import { SetMetadata } from '@nestjs/common';

export const CACHE_OUTPUT_KEY = 'output-cache:options';

export interface CacheOutputOptions {
  /** How long a cached response is served, in whole seconds. */
  ttlSeconds: number;
  /**
   * The Prisma models the response is read from. A write to any of them in
   * the same tenant drops every cached response that names it.
   */
  models: string[];
}

/**
 * Caches what a GET route returns, per tenant, per caller and per URL, and
 * drops it as soon as the outbox reports a write to one of `models`. The
 * route's guards still run on every request, a hit included: the cache sits
 * after the capability check, never in front of it.
 */
export const CacheOutput = (options: CacheOutputOptions) =>
  SetMetadata(CACHE_OUTPUT_KEY, options);
