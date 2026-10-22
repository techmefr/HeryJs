import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { SmsModule } from '#modules/sms/sms.module';
import { StorageDriverRegistry } from '#modules/storage/storage-driver.registry';
import { StorageService } from '#modules/storage/storage.service';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { actingAs } from '#devtools/testing/acting-as';
import type { Actor } from '#devtools/testing/acting-as';
import {
  createTestTenantId,
  purgeTenant,
} from '#devtools/testing/tenant-isolation';
import { SnippetModule } from '../../../examples/snippet/snippet.module';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';
import { PrivacyRetentionTask } from '#technical/privacy/privacy-retention.task';

const DAY_MS = 24 * 60 * 60 * 1000;

function inTenant<T>(
  tenantId: string,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return authPrismaClient.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    return run(tx);
  });
}

interface Person {
  actor: Actor;
  phone: string;
  marker: string;
  fileKey: string;
}

describe('privacy requests across module tables', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SmsModule, SnippetModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    app.get(PersonalDataRegistry, { strict: false }).register({
      model: 'Snippet',
      erase: 'delete',
      fields: [
        {
          name: 'title',
          type: 'file',
          optional: false,
          translatable: false,
          personal: true,
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function personIn(tenantId: string): Promise<Person> {
    const actor = await actingAs(app, { tenantId });
    const phone = `+3361${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    const marker = `marker-${randomUUID()}`;

    await authPrismaClient.user.update({
      where: { id: actor.id },
      data: { phoneNumber: phone },
    });

    const stored = await TenantContextStorage.run({ tenantId }, () =>
      app.get(StorageService, { strict: false }).upload({
        buffer: Buffer.from(marker),
        mimetype: 'image/png',
        size: marker.length,
      }),
    );

    await request(app.getHttpServer())
      .post('/snippets/create')
      .set('Authorization', actor.authorization)
      .send({ data: [{ title: stored.key }] })
      .expect(201);

    await seedRows(tenantId, actor, phone, marker);

    return { actor, phone, marker, fileKey: stored.key };
  }

  async function seedRows(
    tenantId: string,
    actor: Actor,
    phone: string,
    marker: string,
  ): Promise<void> {
    const other = `other-${randomUUID()}`;

    await inTenant(tenantId, async (tx) => {
      await tx.mailLog.create({
        data: {
          tenantId,
          to: actor.email.toUpperCase(),
          subject: marker,
        },
      });
      await tx.scimIdentity.create({
        data: {
          tenantId,
          kind: 'user',
          resourceId: actor.id,
          givenName: marker,
        },
      });
      await tx.recordShare.createMany({
        data: [
          {
            tenantId,
            resource: 'snippet',
            recordId: `${marker}-in`,
            granteeType: 'user',
            granteeId: actor.id,
            access: 'read',
            grantedById: other,
          },
          {
            tenantId,
            resource: 'snippet',
            recordId: `${marker}-out`,
            granteeType: 'user',
            granteeId: other,
            access: 'read',
            grantedById: actor.id,
          },
        ],
      });
      await tx.smsConsent.create({
        data: { tenantId, phone, granted: true, source: 'form' },
      });

      const subscription = await tx.webhookSubscription.create({
        data: {
          tenantId,
          url: 'https://hooks.example.test/in',
          events: ['*'],
          secret: 'secret',
        },
      });
      await tx.webhookDelivery.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          messageId: randomUUID(),
          event: 'user.updated',
          payload: { user: { id: actor.id }, note: marker },
        },
      });

      const endpoint = await tx.webhookEndpoint.create({
        data: { tenantId, source: 'stripe', secret: 'secret' },
      });
      await tx.webhookEvent.create({
        data: {
          tenantId,
          endpointId: endpoint.id,
          source: 'stripe',
          payload: { customer: { email: actor.email }, note: marker },
        },
      });
      await tx.logEntry.createMany({
        data: [
          { tenantId, level: 'info', message: `signed in ${actor.id}` },
          {
            tenantId,
            level: 'info',
            message: marker,
            fields: { email: actor.email },
          },
        ],
      });
      await tx.devtoolsEntry.create({
        data: {
          tenantId,
          kind: 'request',
          label: `GET /users/${actor.id}`,
          detail: { note: marker },
        },
      });
      await tx.oauthIdentity.create({
        data: {
          userId: actor.id,
          provider: 'github',
          providerUserId: marker,
          email: actor.email,
        },
      });

      const connection = await tx.ssoConnection.create({
        data: {
          tenantId,
          name: marker,
          issuer: 'https://idp.example.test',
          clientId: 'client',
        },
      });
      await tx.ssoIdentity.create({
        data: {
          tenantId,
          connectionId: connection.id,
          subject: marker,
          userId: actor.id,
        },
      });
    });
  }

  async function rowsNaming(tenantId: string, person: Person) {
    const { actor, phone, marker } = person;

    return inTenant(tenantId, async (tx) => ({
      MailLog: await tx.mailLog.count({
        where: { to: { equals: actor.email, mode: 'insensitive' } },
      }),
      ScimIdentity: await tx.scimIdentity.count({
        where: { resourceId: actor.id },
      }),
      RecordShare: await tx.recordShare.count({
        where: {
          OR: [{ granteeId: actor.id }, { grantedById: actor.id }],
        },
      }),
      SmsConsent: await tx.smsConsent.count({ where: { phone } }),
      WebhookDelivery: await tx.webhookDelivery.count({
        where: { tenantId, event: 'user.updated' },
      }),
      WebhookEvent: await tx.webhookEvent.count({ where: { tenantId } }),
      LogEntry: await tx.logEntry.count({
        where: {
          tenantId,
          OR: [{ message: marker }, { message: { contains: actor.id } }],
        },
      }),
      DevtoolsEntry: await tx.devtoolsEntry.count({
        where: { tenantId, label: { contains: actor.id } },
      }),
      OauthIdentity: await tx.oauthIdentity.count({
        where: { userId: actor.id },
      }),
      SsoIdentity: await tx.ssoIdentity.count({
        where: { userId: actor.id },
      }),
    }));
  }

  async function requested(actor: Actor, path: string, body: object) {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', actor.authorization)
      .send(body)
      .expect(202);

    return (response.body as { data: { id: string } }).data.id;
  }

  async function settled(tenantId: string, id: string) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const row = await inTenant(tenantId, (tx) =>
        tx.privacyRequest.findUniqueOrThrow({ where: { id } }),
      );

      if (row.status === 'done' || row.status === 'failed') {
        return row;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    throw new Error(`privacy request ${id} did not settle`);
  }

  async function objectExists(key: string): Promise<boolean> {
    const driver = app.get(StorageDriverRegistry, { strict: false }).active;

    return (await driver.stat(key)) !== null;
  }

  it('exports what every module table holds about the user, and nothing of anyone else', async () => {
    const tenantId = createTestTenantId();
    const subject = await personIn(tenantId);
    const bystander = await personIn(tenantId);

    const id = await requested(subject.actor, '/privacy/exports', {});
    const response = await (async () => {
      await settled(tenantId, id);

      return request(app.getHttpServer())
        .get(`/privacy/requests/${id}`)
        .set('Authorization', subject.actor.authorization)
        .expect(200);
    })();
    const bundle = (
      response.body as {
        data: { result: { resources: Record<string, unknown[]> } };
      }
    ).data.result;

    for (const name of [
      'MailLog',
      'ScimIdentity',
      'RecordShare',
      'SmsConsent',
      'WebhookDelivery',
      'WebhookEvent',
      'LogEntry',
      'DevtoolsEntry',
      'OauthIdentity',
      'SsoIdentity',
    ]) {
      expect([name, bundle.resources[name]?.length ?? 0]).not.toEqual([
        name,
        0,
      ]);
    }

    expect(bundle.resources.RecordShare).toHaveLength(2);
    expect(bundle.resources.LogEntry).toHaveLength(2);
    expect(JSON.stringify(bundle)).toContain(subject.marker);
    expect(JSON.stringify(bundle)).not.toContain(bystander.marker);
    expect(JSON.stringify(bundle)).not.toContain(bystander.actor.id);

    await purgeTenant(tenantId);
  });

  it('erases what every module table holds about the user, its stored files, and keeps the rest', async () => {
    const tenantId = createTestTenantId();
    const subject = await personIn(tenantId);
    const bystander = await personIn(tenantId);
    const before = await rowsNaming(tenantId, bystander);

    const id = await requested(subject.actor, '/privacy/erasures/user', {
      userId: subject.actor.id,
    });

    expect(await settled(tenantId, id)).toMatchObject({
      status: 'done',
      error: null,
    });

    expect(await rowsNaming(tenantId, subject)).toEqual({
      MailLog: 0,
      ScimIdentity: 0,
      RecordShare: 0,
      SmsConsent: 0,
      WebhookDelivery: 1,
      WebhookEvent: 1,
      LogEntry: 0,
      DevtoolsEntry: 0,
      OauthIdentity: 0,
      SsoIdentity: 0,
    });
    expect(await rowsNaming(tenantId, bystander)).toEqual({
      ...before,
      WebhookDelivery: 1,
      WebhookEvent: 1,
    });
    expect(
      await inTenant(tenantId, (tx) =>
        tx.webhookDelivery.count({
          where: { payload: { path: ['note'], equals: subject.marker } },
        }),
      ),
    ).toBe(0);
    expect(
      await inTenant(tenantId, (tx) =>
        tx.webhookEvent.count({
          where: { payload: { path: ['note'], equals: subject.marker } },
        }),
      ),
    ).toBe(0);

    expect(await objectExists(subject.fileKey)).toBe(false);
    expect(await objectExists(bystander.fileKey)).toBe(true);

    await purgeTenant(tenantId);
  });

  it('erases every module table of a tenant, and none of another tenant', async () => {
    const tenantId = createTestTenantId();
    const admin = await actingAs(app, { tenantId, role: 'admin' });
    const member = await personIn(tenantId);
    const foreignTenantId = createTestTenantId();
    const foreign = await personIn(foreignTenantId);
    const foreignBefore = await rowsNaming(foreignTenantId, foreign);

    const id = await requested(admin, '/privacy/erasures/tenant', {
      confirm: tenantId,
    });

    expect(await settled(tenantId, id)).toMatchObject({
      status: 'done',
      error: null,
    });

    expect(await rowsNaming(tenantId, member)).toEqual({
      MailLog: 0,
      ScimIdentity: 0,
      RecordShare: 0,
      SmsConsent: 0,
      WebhookDelivery: 0,
      WebhookEvent: 0,
      LogEntry: 0,
      DevtoolsEntry: 0,
      OauthIdentity: 0,
      SsoIdentity: 0,
    });
    expect(await objectExists(member.fileKey)).toBe(false);
    expect(await rowsNaming(foreignTenantId, foreign)).toEqual(foreignBefore);
    expect(await objectExists(foreign.fileKey)).toBe(true);

    await purgeTenant(tenantId);
    await purgeTenant(foreignTenantId);
  });

  it('clears an export nobody collected once its retention has passed', async () => {
    const tenantId = createTestTenantId();
    const subject = await actingAs(app, { tenantId });
    const [stale, fresh] = await inTenant(tenantId, async (tx) =>
      Promise.all(
        [40, 1].map((days) =>
          tx.privacyRequest.create({
            data: {
              tenantId,
              kind: 'export',
              status: 'done',
              subjectId: subject.id,
              result: { identity: { id: subject.id } },
              completedAt: new Date(Date.now() - days * DAY_MS),
            },
          }),
        ),
      ),
    );

    expect(
      await app
        .get(PrivacyRetentionTask, { strict: false })
        .expireExports(new Date()),
    ).toBeGreaterThanOrEqual(1);

    const rows = await inTenant(tenantId, (tx) =>
      tx.privacyRequest.findMany({
        where: { id: { in: [stale!.id, fresh!.id] } },
      }),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(stale!.id)?.result).toBeNull();
    expect(byId.get(stale!.id)?.status).toBe('done');
    expect(byId.get(fresh!.id)?.result).not.toBeNull();

    await purgeTenant(tenantId);
  });
});
