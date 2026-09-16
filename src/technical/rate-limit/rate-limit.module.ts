import { Module, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { env } from '#technical/config/env';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit-store';

/**
 * The global guard is skipped only when RATE_LIMIT_DISABLED says so, and the
 * env schema refuses that flag in production. It used to key off NODE_ENV
 * alone, which meant a single copied variable -- the one most likely to travel
 * between environments by accident -- could ship an app with no brute-force
 * ceiling on auth and no throttling anywhere, with nothing saying so.
 *
 * The test suite sets the flag in test/global-setup.ts, because it shares one
 * Redis and, for unauthenticated routes, one IP: a five-per-five-minutes auth
 * budget trips within the first few specs that register a user. The guard
 * itself is still exercised directly in rate-limit.guard.http.spec.ts and
 * rate-limit-store.spec.ts.
 */
const globalGuardProvider: Provider[] = env.RATE_LIMIT_DISABLED
  ? []
  : [{ provide: APP_GUARD, useClass: RateLimitGuard }];

@Module({
  providers: [RateLimitStore, RateLimitGuard, ...globalGuardProvider],
})
export class RateLimitModule {}
