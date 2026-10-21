import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { CacheableRead } from './etag.decorator';
import { EtagInterceptor } from './etag.interceptor';

let currentTenantId = 'tenant-a';
let currentUserId: string | null = 'user-1';

function tenantMiddleware(_req: Request, _res: Response, next: NextFunction) {
  TenantContextStorage.run(
    { tenantId: currentTenantId, userId: currentUserId },
    next,
  );
}

@Controller('items')
class ItemsController {
  @Get()
  @CacheableRead()
  list() {
    return { data: ['a', 'b'], meta: { total: 2 } };
  }

  @Get('not-cacheable')
  notCacheable() {
    return { data: ['a', 'b'] };
  }
}

describe('EtagInterceptor over a real HTTP round trip', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ItemsController],
      providers: [{ provide: APP_INTERCEPTOR, useClass: EtagInterceptor }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(tenantMiddleware);
    await app.init();
  });

  afterEach(() => {
    currentTenantId = 'tenant-a';
    currentUserId = 'user-1';
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets an ETag on a route marked @CacheableRead()', async () => {
    const response = await request(app.getHttpServer())
      .get('/items')
      .expect(200);

    expect(response.headers.etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    expect(response.headers.vary).toContain('Authorization');
    expect(response.headers.vary).toContain('Cookie');
    expect(response.headers.vary).toContain('Accept-Language');
  });

  it('never computes our own caller-scoped ETag on a route not marked @CacheableRead()', async () => {
    const response = await request(app.getHttpServer())
      .get('/items/not-cacheable')
      .expect(200);

    expect(response.headers.etag).not.toMatch(/^"[0-9a-f]{32}"$/);
  });

  it('returns the same ETag for the same response and answers 304 on a matching If-None-Match', async () => {
    const first = await request(app.getHttpServer()).get('/items').expect(200);
    const etag = first.headers.etag as string;

    const second = await request(app.getHttpServer()).get('/items').expect(200);
    expect(second.headers.etag).toBe(etag);

    const notModified = await request(app.getHttpServer())
      .get('/items')
      .set('If-None-Match', etag)
      .expect(304);
    expect(notModified.text).toBe('');
  });

  it('gives two different callers different ETags for the identical response body', async () => {
    currentUserId = 'user-1';
    const forFirstUser = await request(app.getHttpServer())
      .get('/items')
      .expect(200);

    currentUserId = 'user-2';
    const forSecondUser = await request(app.getHttpServer())
      .get('/items')
      .expect(200);

    expect(forFirstUser.body).toEqual(forSecondUser.body);
    expect(forFirstUser.headers.etag).not.toBe(forSecondUser.headers.etag);
  });

  it('gives two different tenants different ETags for the identical response body', async () => {
    currentTenantId = 'tenant-a';
    const forFirstTenant = await request(app.getHttpServer())
      .get('/items')
      .expect(200);

    currentTenantId = 'tenant-b';
    const forSecondTenant = await request(app.getHttpServer())
      .get('/items')
      .expect(200);

    expect(forFirstTenant.body).toEqual(forSecondTenant.body);
    expect(forFirstTenant.headers.etag).not.toBe(forSecondTenant.headers.etag);
  });

  it('does not honour a stale ETag from a different caller', async () => {
    currentUserId = 'user-1';
    const forFirstUser = await request(app.getHttpServer())
      .get('/items')
      .expect(200);
    const etagForFirstUser = forFirstUser.headers.etag as string;

    currentUserId = 'user-2';
    await request(app.getHttpServer())
      .get('/items')
      .set('If-None-Match', etagForFirstUser)
      .expect(200);
  });
});
