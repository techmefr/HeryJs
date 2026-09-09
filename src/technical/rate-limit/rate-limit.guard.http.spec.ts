import {
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { DomainExceptionFilter } from '#technical/errors/domain-exception.filter';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { RateLimit, UnthrottledRoute } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit-store';

function fixedIdentityMiddleware(userId: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    TenantContextStorage.run({ tenantId: 'tenant-a', userId }, () => next());
  };
}

@Controller('demo')
class DemoController {
  @Get('write')
  @RateLimit('write')
  write() {
    return { ok: true };
  }

  @Get('unthrottled')
  @UnthrottledRoute('health check, polled every second by the load balancer')
  unthrottled() {
    return { ok: true };
  }

  @Get('login')
  @RateLimit('auth')
  login() {
    return { ok: true };
  }
}

@Module({
  controllers: [DemoController],
  providers: [
    RateLimitStore,
    RateLimitGuard,
    Reflector,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
class DemoModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(fixedIdentityMiddleware('user-1')).forRoutes('*');
  }
}

describe('RateLimitGuard wired to a real endpoint', () => {
  let app: INestApplication<App>;
  let store: RateLimitStore;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DemoModule],
    }).compile();

    app = moduleRef.createNestApplication();
    store = app.get(RateLimitStore);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets requests through under the limit, with headers describing the budget', async () => {
    const response = await request(app.getHttpServer())
      .get('/demo/write')
      .expect(200);

    expect(response.headers['ratelimit-limit']).toBe('30');
    expect(Number(response.headers['ratelimit-remaining'])).toBeLessThan(30);
  });

  it('never touches the store for a route marked unthrottled', async () => {
    const hit = jest.spyOn(store, 'hit');

    await request(app.getHttpServer()).get('/demo/unthrottled').expect(200);

    expect(hit).not.toHaveBeenCalled();
    hit.mockRestore();
  });

  it('returns 429 with Retry-After once the bucket is exhausted', async () => {
    const hit = jest.spyOn(store, 'hit').mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    try {
      const response = await request(app.getHttpServer())
        .get('/demo/write')
        .expect(429);

      expect(response.headers['retry-after']).toBe('42');
      expect((response.body as { error: { key: string } }).error.key).toBe(
        'rate-limit.exceeded',
      );
    } finally {
      hit.mockRestore();
    }
  });

  it('fails open on the write bucket when the store is unreachable', async () => {
    const hit = jest
      .spyOn(store, 'hit')
      .mockRejectedValue(new Error('connection refused'));

    try {
      await request(app.getHttpServer()).get('/demo/write').expect(200);
    } finally {
      hit.mockRestore();
    }
  });

  it('fails closed with a 503 on the auth bucket when the store is unreachable', async () => {
    const hit = jest
      .spyOn(store, 'hit')
      .mockRejectedValue(new Error('connection refused'));

    try {
      const response = await request(app.getHttpServer())
        .get('/demo/login')
        .expect(503);

      expect((response.body as { error: { key: string } }).error.key).toBe(
        'rate-limit.unavailable',
      );
    } finally {
      hit.mockRestore();
    }
  });
});
