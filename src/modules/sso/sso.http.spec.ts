import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { SSO_TXT_RESOLVER } from './sso-domain-verifier';
import { SSO_FETCH } from './sso-http';
import { SSO_HOST_RESOLVER } from './sso-url-guard';

const ISSUER = 'https://idp.sso-spec.test';
const CLIENT_SECRET = 'sso-spec-client-secret';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('Enterprise SSO', () => {
  let app: INestApplication<App>;
  let txtRecords: Record<string, string[]> = {};
  let tokenClaims: Record<string, unknown> = {};

  const fakeFetch = (url: string): Promise<Response> => {
    if (url.endsWith('/.well-known/openid-configuration')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/authorize`,
            token_endpoint: `${ISSUER}/token`,
          }),
        ),
      );
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          id_token: `${encode({ alg: 'RS256' })}.${encode(tokenClaims)}.sig`,
        }),
      ),
    );
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SSO_FETCH)
      .useValue(fakeFetch)
      .overrideProvider(SSO_HOST_RESOLVER)
      .useValue(() => Promise.resolve(['93.184.216.34']))
      .overrideProvider(SSO_TXT_RESOLVER)
      .useValue((name: string) => Promise.resolve(txtRecords[name] ?? []))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const asAdmin = async (): Promise<TestUser> => {
    const admin = await registerAndLogin(app);

    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });

    return admin;
  };

  const createConnection = (
    admin: TestUser,
    domain: string,
    linkPolicy = 'refuse',
  ) =>
    request(app.getHttpServer())
      .post('/sso/connections')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Spec IdP',
        issuer: ISSUER,
        clientId: 'spec-client',
        clientSecret: CLIENT_SECRET,
        linkPolicy,
        domains: [domain],
      });

  const verify = async (
    admin: TestUser,
    connection: {
      id: string;
      domains: Array<{ dnsRecord: { name: string; value: string } | null }>;
    },
    domain: string,
  ) => {
    const record = connection.domains[0]?.dnsRecord;

    txtRecords = { [record?.name ?? '']: [record?.value ?? ''] };

    return request(app.getHttpServer())
      .post(`/sso/connections/${connection.id}/domains/${domain}/verify`)
      .set('Authorization', `Bearer ${admin.token}`);
  };

  it('refuses the admin routes to an unauthenticated caller and to a non-admin', async () => {
    await request(app.getHttpServer()).get('/sso/connections').expect(401);

    const member = await registerAndLogin(app);

    await request(app.getHttpServer())
      .get('/sso/connections')
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);
  });

  it('creates a connection without ever returning or storing the secret in clear', async () => {
    const admin = await asAdmin();
    const domain = `${randomUUID()}.example.test`;

    const created = await createConnection(admin, domain).expect(201);
    const body = created.body as { data: { id: string; domains: unknown[] } };
    const stored = await authPrismaClient.ssoConnection.findUniqueOrThrow({
      where: { id: body.data.id },
    });

    expect(JSON.stringify(created.body)).not.toContain(CLIENT_SECRET);
    expect(stored.clientSecret).not.toContain(CLIENT_SECRET);
    expect(stored.clientSecret.startsWith('v1:')).toBe(true);

    const fetched = await request(app.getHttpServer())
      .get(`/sso/connections/${body.data.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(JSON.stringify(fetched.body)).not.toContain(CLIENT_SECRET);
  });

  it('does not route a domain until its TXT record is proven', async () => {
    const admin = await asAdmin();
    const domain = `${randomUUID()}.example.test`;
    const created = await createConnection(admin, domain).expect(201);
    const connection = (
      created.body as {
        data: {
          id: string;
          domains: Array<{ dnsRecord: { name: string; value: string } | null }>;
        };
      }
    ).data;

    txtRecords = {};
    await request(app.getHttpServer())
      .get('/sso/start')
      .query({ email: `jane@${domain}` })
      .expect(404);
    await verify(
      admin,
      {
        ...connection,
        domains: [{ dnsRecord: { name: 'wrong', value: 'wrong' } }],
      },
      domain,
    ).then((response) => {
      expect(response.status).toBe(422);
    });

    await verify(admin, connection, domain).then((response) => {
      expect(response.status).toBe(201);
    });

    const started = await request(app.getHttpServer())
      .get('/sso/start')
      .query({ email: `jane@${domain}`, returnTo: '/welcome' })
      .expect(302);

    expect(started.headers.location).toContain(`${ISSUER}/authorize`);
    expect(String(started.headers['set-cookie'])).toContain('sso_state=');
  });

  it('signs a new user in just in time, inside the tenant of the connection', async () => {
    const admin = await asAdmin();
    const domain = `${randomUUID()}.example.test`;
    const created = await createConnection(admin, domain).expect(201);
    const connection = (
      created.body as {
        data: {
          id: string;
          domains: Array<{ dnsRecord: { name: string; value: string } | null }>;
        };
      }
    ).data;

    await verify(admin, connection, domain);

    const started = await request(app.getHttpServer())
      .get('/sso/start')
      .query({ email: `jane@${domain}`, returnTo: '/welcome' })
      .expect(302);
    const authorize = new URL(String(started.headers.location));
    const cookie = String(started.headers['set-cookie']).split(';')[0] ?? '';

    tokenClaims = {
      iss: ISSUER,
      aud: 'spec-client',
      sub: `sub-${randomUUID()}`,
      email: `jane@${domain}`,
      email_verified: true,
      name: 'Jane',
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce: authorize.searchParams.get('nonce'),
    };

    const callback = await request(app.getHttpServer())
      .get('/sso/callback')
      .query({ code: 'spec-code', state: authorize.searchParams.get('state') })
      .set('Cookie', cookie)
      .expect(200);
    const result = (
      callback.body as {
        data: {
          outcome: string;
          userId: string;
          tenantId: string;
          token: string;
          returnTo: string;
        };
      }
    ).data;

    expect(result).toMatchObject({
      outcome: 'signed-up',
      tenantId: 'default',
      returnTo: '/welcome',
    });
    expect(result.token).toBeTruthy();

    const user = await authPrismaClient.user.findUniqueOrThrow({
      where: { id: result.userId },
    });

    expect(user).toMatchObject({
      email: `jane@${domain}`,
      emailVerified: true,
      tenantId: 'default',
    });

    await request(app.getHttpServer())
      .get('/sso/callback')
      .query({ code: 'spec-code', state: authorize.searchParams.get('state') })
      .expect(400);
  });

  it('refuses a callback when the IdP asserts an email outside the verified domain', async () => {
    const admin = await asAdmin();
    const domain = `${randomUUID()}.example.test`;
    const created = await createConnection(admin, domain).expect(201);
    const connection = (
      created.body as {
        data: {
          id: string;
          domains: Array<{ dnsRecord: { name: string; value: string } | null }>;
        };
      }
    ).data;

    await verify(admin, connection, domain);

    const started = await request(app.getHttpServer())
      .get('/sso/start')
      .query({ email: `jane@${domain}` })
      .expect(302);
    const authorize = new URL(String(started.headers.location));

    tokenClaims = {
      iss: ISSUER,
      aud: 'spec-client',
      sub: `sub-${randomUUID()}`,
      email: 'victim@other-company.test',
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce: authorize.searchParams.get('nonce'),
    };

    await request(app.getHttpServer())
      .get('/sso/callback')
      .query({ code: 'spec-code', state: authorize.searchParams.get('state') })
      .set('Cookie', String(started.headers['set-cookie']).split(';')[0] ?? '')
      .expect(403);
  });

  it('refuses to link an existing local account unless the connection says link-verified', async () => {
    const admin = await asAdmin();
    const domain = `${randomUUID()}.example.test`;
    const local = await registerAndLogin(app);
    const localEmail = `local@${domain}`;

    await authPrismaClient.user.update({
      where: { id: local.id },
      data: { email: localEmail, emailVerified: true },
    });

    const created = await createConnection(admin, domain).expect(201);
    const connection = (
      created.body as {
        data: {
          id: string;
          domains: Array<{ dnsRecord: { name: string; value: string } | null }>;
        };
      }
    ).data;

    await verify(admin, connection, domain);

    const started = await request(app.getHttpServer())
      .get('/sso/start')
      .query({ email: localEmail })
      .expect(302);
    const authorize = new URL(String(started.headers.location));

    tokenClaims = {
      iss: ISSUER,
      aud: 'spec-client',
      sub: `sub-${randomUUID()}`,
      email: localEmail,
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce: authorize.searchParams.get('nonce'),
    };

    await request(app.getHttpServer())
      .get('/sso/callback')
      .query({ code: 'spec-code', state: authorize.searchParams.get('state') })
      .set('Cookie', String(started.headers['set-cookie']).split(';')[0] ?? '')
      .expect(409);
  });

  it('renames a connection but refuses to move it to another issuer', async () => {
    const admin = await asAdmin();
    const created = await createConnection(
      admin,
      `${randomUUID()}.example.test`,
    ).expect(201);
    const { id } = (created.body as { data: { id: string } }).data;

    await request(app.getHttpServer())
      .patch(`/sso/connections/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ issuer: 'https://other-idp.sso-spec.test' })
      .expect(400);

    const renamed = await request(app.getHttpServer())
      .patch(`/sso/connections/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Renamed', isEnabled: false })
      .expect(200);

    expect(renamed.body).toMatchObject({
      data: { name: 'Renamed', isEnabled: false, issuer: ISSUER },
    });
  });

  it('deletes a connection together with its domains and identities', async () => {
    const admin = await asAdmin();
    const domain = `${randomUUID()}.example.test`;
    const created = await createConnection(admin, domain).expect(201);
    const { id } = (created.body as { data: { id: string } }).data;

    await request(app.getHttpServer())
      .delete(`/sso/connections/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    await expect(
      authPrismaClient.ssoDomain.count({ where: { connectionId: id } }),
    ).resolves.toBe(0);
    await request(app.getHttpServer())
      .get(`/sso/connections/${id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404);
  });
});
