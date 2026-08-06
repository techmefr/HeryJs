import {
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { TenantMiddleware } from '#technical/tenancy/tenant.middleware';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { AUTH_PROVIDER } from './auth.types';
import type { AuthProvider, AuthenticatedUser } from './auth.types';
import { SessionGuard } from './session.guard';

const CALLER: AuthenticatedUser = {
  id: 'user-a',
  email: 'a@example.test',
  tenantId: 'tenant-a',
  teamIds: [],
  currentTeamId: null,
  role: null,
  impersonatedBy: null,
};

class CountingAuthProvider implements Pick<
  AuthProvider,
  'validateSession' | 'validateApiKey'
> {
  sessionLookups = 0;
  apiKeyLookups = 0;

  validateSession(token: string): Promise<AuthenticatedUser | null> {
    this.sessionLookups += 1;
    return Promise.resolve(token === 'token-a' ? CALLER : null);
  }

  validateApiKey(token: string): Promise<AuthenticatedUser | null> {
    this.apiKeyLookups += 1;
    return Promise.resolve(
      token === 'hery_ak_prefixa.secret-a' ? CALLER : null,
    );
  }
}

@Controller('whoami')
@UseGuards(SessionGuard)
class WhoAmIController {
  @Get()
  get() {
    return { tenantId: TenantContextStorage.getTenantId() };
  }
}

@Module({
  controllers: [WhoAmIController],
  providers: [{ provide: AUTH_PROVIDER, useClass: CountingAuthProvider }],
})
class DemoModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes(WhoAmIController);
  }
}

/**
 * Authentication happens in two places on purpose -- the middleware needs the
 * tenant before any guard runs, the guard needs the caller -- and each used to
 * pay for its own lookup in the auth store, so every request cost two.
 */
describe('authentication cost per request', () => {
  let app: INestApplication<App>;
  let provider: CountingAuthProvider;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DemoModule],
    }).compile();
    app = moduleRef.createNestApplication();
    provider = app.get<CountingAuthProvider>(AUTH_PROVIDER);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves a session once, and still runs both halves', async () => {
    const before = provider.sessionLookups;

    const response = await request(app.getHttpServer())
      .get('/whoami')
      .set('Authorization', 'Bearer token-a')
      .expect(200);

    expect(response.body).toEqual({ tenantId: 'tenant-a' });
    expect(provider.sessionLookups - before).toBe(1);
  });

  it('resolves an api key once', async () => {
    const before = provider.apiKeyLookups;

    await request(app.getHttpServer())
      .get('/whoami')
      .set('Authorization', 'Bearer hery_ak_prefixa.secret-a')
      .expect(200);

    expect(provider.apiKeyLookups - before).toBe(1);
  });

  it('does not carry the caller of one request into the next', async () => {
    await request(app.getHttpServer())
      .get('/whoami')
      .set('Authorization', 'Bearer token-a')
      .expect(200);

    await request(app.getHttpServer())
      .get('/whoami')
      .set('Authorization', 'Bearer token-b')
      .expect(401);
  });
});
