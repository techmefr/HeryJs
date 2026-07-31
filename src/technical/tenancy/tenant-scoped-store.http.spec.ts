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
import { AUTH_PROVIDER } from '../auth/auth.types';
import type { AuthProvider, AuthenticatedUser } from '../auth/auth.types';
import { TenantMiddleware } from './tenant.middleware';
import { TenantScopedStore } from './tenant-scoped-store';

interface Widget {
  id: string;
  name: string;
}

const USERS_BY_TOKEN: Record<string, AuthenticatedUser> = {
  'token-a': {
    id: 'user-a',
    email: 'a@example.test',
    tenantId: 'tenant-a',
    teamIds: [],
    currentTeamId: null,
    role: null,
    impersonatedBy: null,
  },
  'token-b': {
    id: 'user-b',
    email: 'b@example.test',
    tenantId: 'tenant-b',
    teamIds: [],
    currentTeamId: null,
    role: null,
    impersonatedBy: null,
  },
};

class StubAuthProvider implements Pick<AuthProvider, 'validateSession'> {
  validateSession(token: string): Promise<AuthenticatedUser | null> {
    return Promise.resolve(USERS_BY_TOKEN[token] ?? null);
  }
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
  providers: [
    TenantScopedStore,
    { provide: AUTH_PROVIDER, useClass: StubAuthProvider },
  ],
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
      .set('Authorization', 'Bearer token-a')
      .send({ id: 'w1', name: 'from A' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer token-b')
      .send({ id: 'w2', name: 'from B' })
      .expect(201);

    const asTenantA = await request(app.getHttpServer())
      .get('/widgets')
      .set('Authorization', 'Bearer token-a')
      .expect(200);

    const asTenantB = await request(app.getHttpServer())
      .get('/widgets')
      .set('Authorization', 'Bearer token-b')
      .expect(200);

    expect(asTenantA.body).toEqual([
      { id: 'w1', name: 'from A', tenantId: 'tenant-a' },
    ]);
    expect(asTenantB.body).toEqual([
      { id: 'w2', name: 'from B', tenantId: 'tenant-b' },
    ]);
  });

  it('cannot be spoofed into another tenant via a client-supplied header', async () => {
    const response = await request(app.getHttpServer())
      .get('/widgets')
      .set('Authorization', 'Bearer token-a')
      .set('x-tenant-id', 'tenant-b')
      .expect(200);

    expect(
      (response.body as Array<{ tenantId: string }>).every(
        (widget) => widget.tenantId === 'tenant-a',
      ),
    ).toBe(true);
  });
});
