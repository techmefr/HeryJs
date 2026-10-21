import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { SCIM_CONTENT_TYPE, SCIM_PATCH_SCHEMA } from './scim.types';

interface ScimBody {
  id: string;
  schemas: string[];
  userName: string;
  totalResults: number;
  active: boolean;
  patch: { supported: boolean };
  members: unknown[];
  data: { token: string };
}

const bodyOf = (response: { body: unknown }): ScimBody =>
  response.body as ScimBody;

const EMAIL = 'scim-spec-user@scim-spec.test';

describe('SCIM provisioning', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });

    const issued = await request(app.getHttpServer())
      .post('/scim/token')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(201);

    token = bodyOf(issued).data.token;
  });

  afterAll(async () => {
    await authPrismaClient.user.deleteMany({ where: { email: EMAIL } });
    await authPrismaClient.scimToken.deleteMany({
      where: { tenantId: 'default' },
    });
    await app.close();
  });

  const scim = (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`/scim/v2${path}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', SCIM_CONTENT_TYPE);

  it('refuses a call without a valid token, in the SCIM error format', async () => {
    const response = await request(app.getHttpServer())
      .get('/scim/v2/Users')
      .expect(401);

    expect(bodyOf(response).schemas).toContain(
      'urn:ietf:params:scim:api:messages:2.0:Error',
    );

    await request(app.getHttpServer())
      .get('/scim/v2/Users')
      .set('Authorization', 'Bearer scim_wrong')
      .expect(401);
  });

  it('refuses the admin routes to a non-admin', async () => {
    const member = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post('/scim/token')
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);
  });

  it('serves the discovery documents', async () => {
    const response = await scim('get', '/ServiceProviderConfig').expect(200);

    expect(response.headers['content-type']).toContain(SCIM_CONTENT_TYPE);
    expect(bodyOf(response).patch.supported).toBe(true);

    await scim('get', '/ResourceTypes').expect(200);
    await scim('get', '/Schemas').expect(200);
  });

  it('creates, finds, deactivates and reactivates a member', async () => {
    const created = await scim('post', '/Users')
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: EMAIL,
        externalId: 'ext-spec',
        name: { givenName: 'Spec', familyName: 'User' },
        active: true,
      })
      .expect(201);

    const id: string = bodyOf(created).id;

    expect(bodyOf(created).userName).toBe(EMAIL);

    await scim('post', '/Users').send({ userName: EMAIL }).expect(409);

    const found = await scim(
      'get',
      `/Users?filter=${encodeURIComponent(`userName eq "${EMAIL}"`)}`,
    ).expect(200);

    expect(bodyOf(found).totalResults).toBe(1);

    const off = await scim('patch', `/Users/${id}`)
      .send({
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [{ op: 'Replace', path: 'active', value: 'False' }],
      })
      .expect(200);

    expect(bodyOf(off).active).toBe(false);

    const stored = await authPrismaClient.user.findUnique({ where: { id } });

    expect(stored?.banned).toBe(true);

    const on = await scim('patch', `/Users/${id}`)
      .send({
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [{ op: 'replace', value: { active: true } }],
      })
      .expect(200);

    expect(bodyOf(on).active).toBe(true);

    await scim('delete', `/Users/${id}`).expect(204);
    await scim('get', `/Users/${id}`).expect(200);
  });

  it('maps a group onto a team with its members', async () => {
    const user = await scim('post', '/Users')
      .send({ userName: 'scim-group-member@scim-spec.test' })
      .expect(201);

    const group = await scim('post', '/Groups')
      .send({
        displayName: 'Scim Spec Team',
        members: [{ value: bodyOf(user).id }],
      })
      .expect(201);

    expect(bodyOf(group).members).toHaveLength(1);

    await scim('delete', `/Groups/${bodyOf(group).id}`).expect(204);
    await scim('get', `/Groups/${bodyOf(group).id}`).expect(404);
    await authPrismaClient.user.deleteMany({
      where: { email: 'scim-group-member@scim-spec.test' },
    });
  });

  it('shows the provisioning activity to an admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/scim/activity')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const actions = (
      response.body as { data: Array<{ action: string }> }
    ).data.map((entry) => entry.action);

    expect(actions).toEqual(
      expect.arrayContaining(['created', 'deactivated', 'issued']),
    );
  });

  it('stops honouring a token once it is rotated or revoked', async () => {
    const rotated = await request(app.getHttpServer())
      .post('/scim/token')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(201);

    await scim('get', '/Users').expect(401);

    token = bodyOf(rotated).data.token;
    await scim('get', '/Users').expect(200);

    await request(app.getHttpServer())
      .delete('/scim/token')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    await scim('get', '/Users').expect(401);
  });
});
