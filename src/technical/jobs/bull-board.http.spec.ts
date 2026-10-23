import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import {
  clearPlatformOperators,
  grantPlatformOperator,
} from '#devtools/testing/platform-operator';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { BULL_BOARD_BASE_PATH, mountBullBoard } from './bull-board';

describe('the queue dashboard', () => {
  let app: INestApplication<App>;
  let operator: TestUser;
  let tenantAdmin: TestUser;
  let otherTenantAdmin: TestUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    mountBullBoard(app);
    await app.init();

    operator = await registerAndLogin(app);
    tenantAdmin = await registerAndLogin(app);
    otherTenantAdmin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: tenantAdmin.id },
      data: { role: 'admin', tenantId: 'bull-board-tenant-a' },
    });
    await authPrismaClient.user.update({
      where: { id: otherTenantAdmin.id },
      data: { role: 'admin', tenantId: 'bull-board-tenant-b' },
    });
    grantPlatformOperator(operator.id);
  });

  afterAll(async () => {
    clearPlatformOperators();
    await app.close();
  });

  const as = (call: request.Test, user?: TestUser) =>
    user ? call.set('Authorization', `Bearer ${user.token}`) : call;
  const open = (route: string, user?: TestUser) =>
    as(request(app.getHttpServer()).get(BULL_BOARD_BASE_PATH + route), user);

  it('opens for the platform operator', async () => {
    const response = await open('/', operator);

    expect(response.status).toBe(200);
  });

  it.each([
    ['an anonymous caller', undefined],
    ['the admin of tenant a', () => tenantAdmin],
    ['the admin of tenant b', () => otherTenantAdmin],
  ])('is not there for %s', async (_label, who) => {
    const user = who?.();

    await open('/', user).expect(404);
    await open('/api/queues', user).expect(404);
    await as(
      request(app.getHttpServer()).put(
        BULL_BOARD_BASE_PATH + '/api/queues/default/retry/failed',
      ),
      user,
    ).expect(404);
  });
});
