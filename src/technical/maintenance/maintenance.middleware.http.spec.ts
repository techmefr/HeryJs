import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { MaintenanceMiddleware } from './maintenance.middleware';
import {
  MAINTENANCE_BYPASS_HEADER,
  hashMaintenanceSecret,
} from './maintenance-state';
import { MaintenanceStore } from './maintenance-store';

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { pong: true };
  }

  @Get('health/ready')
  ready() {
    return { status: 'ok' };
  }
}

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6479';

@Module({
  controllers: [PingController],
  providers: [
    {
      provide: MaintenanceStore,
      useFactory: () => new MaintenanceStore(REDIS_URL),
    },
    MaintenanceMiddleware,
  ],
  exports: [MaintenanceStore],
})
class MaintenanceTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MaintenanceMiddleware).forRoutes('*');
  }
}

describe('Maintenance mode over a real HTTP round trip', () => {
  let app: INestApplication<App>;
  let store: MaintenanceStore;
  const admin = new MaintenanceStore(REDIS_URL);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MaintenanceTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    store = moduleRef.get(MaintenanceStore);
  });

  afterEach(async () => {
    await admin.disable();
    await store.disable();
  });

  afterAll(async () => {
    await app.close();
    admin.close();
    store.close();
  });

  it('serves normally while maintenance is off', async () => {
    await request(app.getHttpServer()).get('/ping').expect(200);
  });

  it('answers 503 with Retry-After once it is on, and serves again once it is lifted', async () => {
    await store.enable({
      secretHash: null,
      retryAfterSeconds: 120,
      message: 'Back at noon.',
      startedAt: new Date().toISOString(),
    });

    const refused = await request(app.getHttpServer()).get('/ping').expect(503);

    expect(refused.headers['retry-after']).toBe('120');
    expect(refused.body).toMatchObject({
      error: {
        status: 503,
        key: 'maintenance.active',
        message: 'Back at noon.',
      },
    });

    await store.disable();

    await request(app.getHttpServer()).get('/ping').expect(200);
  });

  it('renders a page for a browser', async () => {
    await store.enable({
      secretHash: null,
      retryAfterSeconds: 60,
      message: null,
      startedAt: new Date().toISOString(),
    });

    const page = await request(app.getHttpServer())
      .get('/ping')
      .set('Accept', 'text/html')
      .expect(503);

    expect(page.headers['content-type']).toContain('text/html');
    expect(page.headers['retry-after']).toBe('60');
  });

  it('lets a request through when it carries the secret, and only then', async () => {
    await store.enable({
      secretHash: hashMaintenanceSecret('open-sesame'),
      retryAfterSeconds: 60,
      message: null,
      startedAt: new Date().toISOString(),
    });

    await request(app.getHttpServer())
      .get('/ping')
      .set(MAINTENANCE_BYPASS_HEADER, 'open-sesame')
      .expect(200);

    await request(app.getHttpServer())
      .get('/ping')
      .set(MAINTENANCE_BYPASS_HEADER, 'wrong')
      .expect(503);

    await request(app.getHttpServer()).get('/ping').expect(503);
  });

  it('keeps the readiness probe reachable so the instance is not killed for refusing traffic', async () => {
    await store.enable({
      secretHash: null,
      retryAfterSeconds: 60,
      message: null,
      startedAt: new Date().toISOString(),
    });

    await request(app.getHttpServer()).get('/health/ready').expect(200);
    await request(app.getHttpServer()).get('/health/ready/').expect(200);
    await request(app.getHttpServer()).get('/ping?next=/health').expect(503);
  });

  it('notices a state written by another process, such as the CLI', async () => {
    await admin.enable({
      secretHash: null,
      retryAfterSeconds: 60,
      message: null,
      startedAt: new Date().toISOString(),
    });

    await request(app.getHttpServer()).get('/ping').expect(503);
  });
});
