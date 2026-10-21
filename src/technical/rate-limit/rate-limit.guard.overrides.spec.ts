import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { RateLimitGuard } from './rate-limit.guard';

function httpContext(): ExecutionContext {
  const response = { setHeader: jest.fn() };

  return {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class Demo {},
    switchToHttp: () => ({
      getRequest: () => ({ ip: '127.0.0.1' }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard with a per-tenant override', () => {
  const hit = jest.fn().mockResolvedValue({
    allowed: true,
    remaining: 0,
    retryAfterSeconds: 60,
  });
  const store = { hit } as never;

  beforeEach(() => hit.mockClear());

  const run = (guard: RateLimitGuard) =>
    TenantContextStorage.run({ tenantId: 't1', userId: 'u1' }, () =>
      guard.canActivate(httpContext()),
    );

  it('hits the store with the tenant limit and the bucket window', async () => {
    const guard = new RateLimitGuard(new Reflector(), store, {
      limitFor: jest.fn().mockResolvedValue(500),
    } as never);

    await run(guard);

    expect(hit).toHaveBeenCalledWith('read:t1:u1', 500, 60);
  });

  it('keeps the configured limit when the tenant has none', async () => {
    const guard = new RateLimitGuard(new Reflector(), store, {
      limitFor: jest.fn().mockResolvedValue(undefined),
    } as never);

    await run(guard);

    expect(hit).toHaveBeenCalledWith('read:t1:u1', 120, 60);
  });

  it('keeps the configured limit when no overrides provider is wired', async () => {
    await run(new RateLimitGuard(new Reflector(), store));

    expect(hit).toHaveBeenCalledWith('read:t1:u1', 120, 60);
  });
});
