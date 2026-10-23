import { randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '@heryjs/core/auth';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { SSO_TXT_RESOLVER } from '#modules/sso/sso-domain-verifier';
import { SSO_FETCH } from '#modules/sso/sso-http';
import { SSO_HOST_RESOLVER } from '#modules/sso/sso-url-guard';
import {
  encodeSamlResponse,
  generateSamlTestIdp,
  samlResponseXml,
} from '#modules/sso/sso-saml.fakes';

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

  beforeEach(async () => {
    await authPrismaClient.ssoConnection.deleteMany({
      where: { tenantId: 'default' },
    });
  });

  afterAll(async () => {
    await authPrismaClient.ssoConnection.deleteMany({
      where: { tenantId: 'default' },
    });
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
    expect(stored.clientSecret?.startsWith('v1:')).toBe(true);

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
      .expect(422);

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

  describe('with a SAML identity provider', () => {
    const idp = generateSamlTestIdp();
    const samlIssuer = 'https://idp.sso-spec.test/saml';

    const createSamlConnection = (admin: TestUser, domain: string) =>
      request(app.getHttpServer())
        .post('/sso/connections')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          protocol: 'saml',
          name: 'Spec SAML IdP',
          issuer: samlIssuer,
          entryPoint: `${samlIssuer}/login`,
          certificate: idp.certificate,
          domains: [domain],
        });

    it('lets a tenant admin configure it without returning the certificate', async () => {
      const admin = await asAdmin();
      const created = await createSamlConnection(
        admin,
        `${randomUUID()}.example.test`,
      ).expect(201);
      const body = created.body as {
        data: {
          protocol: string;
          hasClientSecret: boolean;
          saml: { acsUrl: string; spEntityId: string };
        };
      };

      expect(body.data).toMatchObject({
        protocol: 'saml',
        hasClientSecret: false,
      });
      expect(body.data.saml.acsUrl).toContain('/sso/saml/acs');
      expect(JSON.stringify(created.body)).not.toContain('BEGIN CERTIFICATE');
    });

    it('signs a user in from a signed assertion posted to the ACS, once', async () => {
      const admin = await asAdmin();
      const domain = `${randomUUID()}.example.test`;
      const created = await createSamlConnection(admin, domain).expect(201);
      const connection = (
        created.body as {
          data: {
            id: string;
            domains: Array<{
              dnsRecord: { name: string; value: string } | null;
            }>;
            saml: { acsUrl: string; spEntityId: string };
          };
        }
      ).data;

      await verify(admin, connection, domain);

      const started = await request(app.getHttpServer())
        .get('/sso/start')
        .query({ email: `jane@${domain}`, returnTo: '/welcome' })
        .expect(302);
      const location = new URL(String(started.headers.location));
      const cookieHeader = String(started.headers['set-cookie']);
      const authnRequest = inflateRawSync(
        Buffer.from(location.searchParams.get('SAMLRequest') ?? '', 'base64'),
      ).toString();
      const requestId = /ID="([^"]+)"/.exec(authnRequest)?.[1] ?? '';
      const cookie = cookieHeader.split(';')[0] ?? '';
      const samlResponse = encodeSamlResponse(
        samlResponseXml({
          idp,
          idpIssuer: samlIssuer,
          audience: connection.saml.spEntityId,
          acsUrl: connection.saml.acsUrl,
          inResponseTo: requestId,
          email: `jane@${domain}`,
          name: 'Jane',
        }),
      );

      expect(location.origin + location.pathname).toBe(`${samlIssuer}/login`);
      expect(cookieHeader).toContain('SameSite=None');
      expect(cookieHeader).toContain('Secure');

      const acs = await request(app.getHttpServer())
        .post('/sso/saml/acs')
        .set('Cookie', cookie)
        .type('form')
        .send({
          SAMLResponse: samlResponse,
          RelayState: location.searchParams.get('RelayState'),
        })
        .expect(201);
      const result = (
        acs.body as {
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

      await request(app.getHttpServer())
        .post('/sso/saml/acs')
        .type('form')
        .send({
          SAMLResponse: samlResponse,
          RelayState: location.searchParams.get('RelayState'),
        })
        .expect(400);
    });

    it('refuses an unsigned assertion with a valid state cookie', async () => {
      const admin = await asAdmin();
      const domain = `${randomUUID()}.example.test`;
      const created = await createSamlConnection(admin, domain).expect(201);
      const connection = (
        created.body as {
          data: {
            id: string;
            domains: Array<{
              dnsRecord: { name: string; value: string } | null;
            }>;
            saml: { acsUrl: string; spEntityId: string };
          };
        }
      ).data;

      await verify(admin, connection, domain);

      const started = await request(app.getHttpServer())
        .get('/sso/start')
        .query({ email: `jane@${domain}` })
        .expect(302);
      const location = new URL(String(started.headers.location));
      const authnRequest = inflateRawSync(
        Buffer.from(location.searchParams.get('SAMLRequest') ?? '', 'base64'),
      ).toString();

      await request(app.getHttpServer())
        .post('/sso/saml/acs')
        .set(
          'Cookie',
          String(started.headers['set-cookie']).split(';')[0] ?? '',
        )
        .type('form')
        .send({
          SAMLResponse: encodeSamlResponse(
            samlResponseXml({
              idp,
              idpIssuer: samlIssuer,
              audience: connection.saml.spEntityId,
              acsUrl: connection.saml.acsUrl,
              inResponseTo: /ID="([^"]+)"/.exec(authnRequest)?.[1] ?? '',
              email: `jane@${domain}`,
              sign: 'none',
            }),
          ),
          RelayState: location.searchParams.get('RelayState'),
        })
        .expect(400);
    });
  });
});
