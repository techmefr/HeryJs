import {
  Body,
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { TenantMiddleware } from './tenant.middleware';
import { TenantScopedStore } from './tenant-scoped-store';

interface Widget {
  id: string;
  name: string;
}

@Controller('widgets')
class WidgetsController {
  constructor(private readonly store: TenantScopedStore<Widget>) {}

  @Post()
  create(@Body() body: Widget) {
    return this.store.create(body);
  }

  @Get()
  findAll() {
    return this.store.findAll();
  }
}

@Module({
  controllers: [WidgetsController],
  providers: [TenantScopedStore],
})
class DemoModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes(WidgetsController);
  }
}

describe('tenant isolation over a real HTTP round trip', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DemoModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('never lets tenant A see tenant B data, or the other way around', async () => {
    await request(app.getHttpServer())
      .post('/widgets')
      .set('x-tenant-id', 'tenant-a')
      .send({ id: 'w1', name: 'from A' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/widgets')
      .set('x-tenant-id', 'tenant-b')
      .send({ id: 'w2', name: 'from B' })
      .expect(201);

    const asTenantA = await request(app.getHttpServer())
      .get('/widgets')
      .set('x-tenant-id', 'tenant-a')
      .expect(200);

    const asTenantB = await request(app.getHttpServer())
      .get('/widgets')
      .set('x-tenant-id', 'tenant-b')
      .expect(200);

    expect(asTenantA.body).toEqual([
      { id: 'w1', name: 'from A', tenantId: 'tenant-a' },
    ]);
    expect(asTenantB.body).toEqual([
      { id: 'w2', name: 'from B', tenantId: 'tenant-b' },
    ]);
  });
});
