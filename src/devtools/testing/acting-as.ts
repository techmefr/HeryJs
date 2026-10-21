import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from './register-and-login';

export const DEFAULT_TEST_TENANT_ID = 'default';

export interface ActingAsOptions {
  tenantId?: string;
  role?: string | null;
}

export interface Actor {
  id: string;
  email: string;
  token: string;
  tenantId: string;
  role: string | null;
  authorization: string;
  kind: 'session' | 'api-key';
}

interface Authorizable<T> {
  set(field: string, value: string): T;
}

export async function actingAs(
  app: INestApplication<App>,
  options: ActingAsOptions = {},
): Promise<Actor> {
  const user = await registerAndLogin(app);
  const tenantId = options.tenantId ?? DEFAULT_TEST_TENANT_ID;
  const role = options.role ?? null;

  if (options.tenantId !== undefined || options.role !== undefined) {
    await authPrismaClient.user.update({
      where: { id: user.id },
      data: { tenantId, role },
    });
  }

  return {
    ...user,
    tenantId,
    role,
    authorization: `Bearer ${user.token}`,
    kind: 'session',
  };
}

export async function actingAsApiKey(
  app: INestApplication<App>,
  options: ActingAsOptions = {},
): Promise<Actor> {
  const owner = await actingAs(app, options);

  const created = await request(app.getHttpServer())
    .post('/api-keys')
    .set('Authorization', owner.authorization)
    .send({ name: 'test-support' })
    .expect(201);

  const { key } = (created.body as { data: { key: string } }).data;

  return {
    ...owner,
    token: key,
    authorization: `Bearer ${key}`,
    kind: 'api-key',
  };
}

export function asActor<T extends Authorizable<T>>(
  pending: T,
  actor: Actor,
): T {
  return pending.set('Authorization', actor.authorization);
}
