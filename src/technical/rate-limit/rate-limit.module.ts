import { Module, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit-store';

/**
 * Not registered as the global guard under NODE_ENV=test: the whole test
 * suite shares one Redis and, for any unauthenticated route, one IP, so a
 * fixed-window `auth` budget of five hits per five minutes trips within the
 * first few spec files that register a user. The guard itself is still
 * exercised for real, directly, in rate-limit.guard.http.spec.ts and
 * rate-limit-store.spec.ts -- this only skips wiring it across every other
 * suite's unrelated HTTP calls.
 */
const globalGuardProvider: Provider[] =
  process.env.NODE_ENV === 'test'
    ? []
    : [{ provide: APP_GUARD, useClass: RateLimitGuard }];

@Module({
  providers: [RateLimitStore, RateLimitGuard, ...globalGuardProvider],
})
export class RateLimitModule {}
