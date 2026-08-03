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
import { AUTH_PROVIDER } from '#technical/auth/auth.types';
import type {
  AuthProvider,
  AuthenticatedUser,
} from '#technical/auth/auth.types';
import { TenantMiddleware } from './tenant.middleware';
import { TenantScopedStore } from './tenant-scoped-store';

interface Widget {
  id: string;
  name: string;
}

const USER_A: AuthenticatedUser = {
  id: 'user-a',
  email: 'a@example.test',
  tenantId: 'tenant-a',
  teamIds: [],
  currentTeamId: null,
  role: null,
  impersonatedBy: null,
};

const USER_B: AuthenticatedUser = {
  id: 'user-b',
  email: 'b@example.test',
  tenantId: 'tenant-b',
  teamIds: [],
  currentTeamId: null,
  role: null,
  impersonatedBy: null,
};

const USERS_BY_TOKEN: Record<string, AuthenticatedUser> = {
  'token-a': USER_A,
  'token-b': USER_B,
};

// Shaped like a real key (ApiKeyService.isApiKey keys off the hery_ak_ prefix)
// and deliberately absent from USERS_BY_TOKEN: a key has no session row, so a
// provider that is only asked for a session answers null for it.
const USERS_BY_API_KEY: Record<string, AuthenticatedUser> = {
  'hery_ak_prefixa.secret-a': USER_A,
  'hery_ak_prefixb.secret-b': USER_B,
};

class StubAuthProvider implements Pick<
  AuthProvider,
  'validateSession' | 'validateApiKey'
> {
  validateSession(token: string): Promise<AuthenticatedUser | null> {
    return Promise.resolve(USERS_BY_TOKEN[token] ?? null);
  }

  validateApiKey(token: string): Promise<AuthenticatedUser | null> {
    return Promise.resolve(USERS_BY_API_KEY[token] ?? null);
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

  it('puts an api key in its own tenant, not in a pseudo-tenant shared with every other key', async () => {
    await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer hery_ak_prefixa.secret-a')
      .send({ id: 'k1', name: 'from A key' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer hery_ak_prefixb.secret-b')
      .send({ id: 'k2', name: 'from B key' })
      .expect(201);

    const asKeyA = await request(app.getHttpServer())
      .get('/widgets')
      .set('Authorization', 'Bearer hery_ak_prefixa.secret-a')
      .expect(200);

    const rows = asKeyA.body as Array<{ id: string; tenantId: string }>;

    // The key writes and reads inside tenant-a, which is what makes the
    // middleware agree with the guard. Before both resolved the caller the
    // same way, every key of every tenant shared the tenantId
    // 'unauthenticated', so this list also carried k2.
    expect(rows.every((widget) => widget.tenantId === 'tenant-a')).toBe(true);
    expect(rows.map((widget) => widget.id)).toContain('k1');
    expect(rows.map((widget) => widget.id)).not.toContain('k2');
  });

  it('sees an api-key caller and a session caller of one tenant as the same tenant', async () => {
    await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer hery_ak_prefixa.secret-a')
      .send({ id: 'k3', name: 'written with a key' })
      .expect(201);

    const asSession = await request(app.getHttpServer())
      .get('/widgets')
      .set('Authorization', 'Bearer token-a')
      .expect(200);

    expect(
      (asSession.body as Array<{ id: string }>).map((widget) => widget.id),
    ).toContain('k3');
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
