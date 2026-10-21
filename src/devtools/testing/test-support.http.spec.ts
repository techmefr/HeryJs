import { randomUUID } from 'node:crypto';
import { AUTH_PROVIDER } from '#technical/auth/auth.types';
import type { AuthProvider } from '#technical/auth/auth.types';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { EventDispatcher } from '#technical/events/event-dispatcher.service';
import { LockService } from '#technical/lock/lock.service';
import { JobsService } from '#technical/jobs/jobs.service';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { MailProcessor } from '#modules/mail/mail.processor';
import { MailService } from '#modules/mail/mail.service';
import { NotifierService } from '#modules/notifier/notifier.service';
import { StorageService } from '#modules/storage/storage.service';
import { actingAs, actingAsApiKey } from './acting-as';
import { bootTestApp } from './boot-test-app';
import type { TestApp } from './boot-test-app';
import { inRolledBackTransaction } from './tenant-isolation';

class InvoicePaid {
  constructor(public readonly invoiceId: string) {}
}

function inTenant<T>(testApp: TestApp, work: () => Promise<T>): Promise<T> {
  return TenantContextStorage.run(
    { tenantId: testApp.tenantId ?? 'default' },
    work,
  );
}

describe('test support: delivery fakes behind the real services', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await bootTestApp({ isolation: 'tenant' });
  });

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(() => {
    testApp.fakes.mail.reset();
    testApp.fakes.storage.reset();
  });

  it('stores an upload in the fake storage driver', async () => {
    const stored = await inTenant(testApp, () =>
      testApp.app.get(StorageService).upload({
        buffer: Buffer.from('png-bytes'),
        mimetype: 'image/png',
        size: 9,
      }),
    );

    testApp.fakes.storage.assertStored(stored.key);
    expect(stored.url).toContain(stored.key);
  });
});

describe('test support: mail through a drained job queue', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await bootTestApp({
      fakes: ['mail', 'jobs'],
      isolation: 'tenant',
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('delivers a queued mail into the fake driver once the job is drained', async () => {
    const to = `${randomUUID()}@example.test`;

    await inTenant(testApp, () =>
      testApp.app.get(MailService).send({
        to,
        build: () => ({ to, subject: 'Welcome', html: '<p>Welcome</p>' }),
      }),
    );

    testApp.fakes.mail.assertNotSent();

    const drained = await inTenant(testApp, () =>
      testApp.fakes.jobs.drain(testApp.app.get(MailProcessor)),
    );

    expect(drained).toBe(1);
    testApp.fakes.mail.assertSent((message) => message.to === to, 1);
    testApp.fakes.mail.assertNotSent(
      (message) => message.to === 'nobody@example.test',
    );
  });
});

describe('test support: seam fakes and the clock', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await bootTestApp({
      fakes: 'all',
      isolation: 'tenant',
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('replaces the job queue with a recorder', async () => {
    await testApp.app.get(JobsService).dispatch('report.build', { id: 1 });

    testApp.fakes.jobs.assertDispatched(
      'report.build',
      (job) => job.data.id === 1,
      1,
    );
  });

  it('keeps mail out of the driver when jobs are faked, and records the job instead', async () => {
    const to = `${randomUUID()}@example.test`;

    await inTenant(testApp, () =>
      testApp.app.get(MailService).send({
        to,
        build: () => ({ to, subject: 'Queued', html: '' }),
      }),
    );

    testApp.fakes.jobs.assertDispatched(
      'mail.send',
      (job) => job.data.to === to,
    );
    testApp.fakes.mail.assertNotSent((message) => message.to === to);
  });

  it('replaces the event bus with a recorder', async () => {
    await testApp.app.get(EventDispatcher).dispatch(new InvoicePaid('inv-1'));

    testApp.fakes.events.assertDispatched(
      InvoicePaid,
      (event) => event.invoiceId === 'inv-1',
    );
  });

  it('replaces locks with an in-memory recorder', async () => {
    const locks = testApp.app.get(LockService);
    testApp.fakes.locks.hold('nightly');

    await expect(
      locks.runExclusively('nightly', () => undefined),
    ).resolves.toBe('skipped');

    testApp.fakes.locks.assertContended('nightly');
  });

  it('records notifier deliveries per channel', async () => {
    await testApp.app.get(NotifierService).send(
      { email: 'a@example.test', userId: 'u-1' },
      {
        toMail: () => ({ to: 'a@example.test', subject: 'Hi', html: '' }),
        toPush: () => ({ title: 'Hi', body: 'There' }),
      },
    );

    testApp.fakes.notifier.assertSent(
      (record) => record.channel === 'mail' && record.to === 'a@example.test',
    );
    testApp.fakes.notifier.assertSent(
      (record) => record.channel === 'push' && record.to === 'u-1',
    );
  });

  it('freezes the clock for the whole suite', () => {
    const first = Date.now();

    testApp.fakes.clock.travel(3_600_000);

    expect(Date.now() - first).toBe(3_600_000);
  });
});

describe('test support: actors and isolation', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await bootTestApp({ isolation: 'tenant' });
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('acts as a user of the suite tenant with a role', async () => {
    const actor = await testApp.actingAs({ role: 'admin' });
    const user = await testApp.app
      .get<AuthProvider>(AUTH_PROVIDER)
      .validateSession(actor.token);

    expect(user).toMatchObject({
      id: actor.id,
      tenantId: testApp.tenantId,
      role: 'admin',
    });
  });

  it('acts as a user of an explicit tenant', async () => {
    const tenantId = `tenant-${randomUUID()}`;
    const actor = await actingAs(testApp.app, { tenantId });
    const user = await testApp.app
      .get<AuthProvider>(AUTH_PROVIDER)
      .validateSession(actor.token);

    expect(user?.tenantId).toBe(tenantId);
  });

  it('acts through an API key that resolves to the same user', async () => {
    const actor = await actingAsApiKey(testApp.app, { role: 'admin' });
    const user = await testApp.app
      .get<AuthProvider>(AUTH_PROVIDER)
      .validateApiKey(actor.token);

    expect(actor.kind).toBe('api-key');
    expect(user).toMatchObject({ id: actor.id, role: 'admin' });
  });

  it('rolls a transaction back after the work', async () => {
    const email = `${randomUUID()}@example.test`;

    await inRolledBackTransaction(authPrismaClient, async (transaction) => {
      await transaction.user.create({ data: { email } });

      expect(await transaction.user.count({ where: { email } })).toBe(1);
    });

    expect(await authPrismaClient.user.count({ where: { email } })).toBe(0);
  });

  it('rethrows what the rolled back work threw', async () => {
    await expect(
      inRolledBackTransaction(authPrismaClient, () =>
        Promise.reject(new Error('boom')),
      ),
    ).rejects.toThrow('boom');
  });

  it('purges the suite tenant on close', async () => {
    const isolated = await bootTestApp({ isolation: 'tenant' });
    const actor = await isolated.actingAs();

    expect(await authPrismaClient.user.count({ where: { id: actor.id } })).toBe(
      1,
    );

    await isolated.close();

    expect(await authPrismaClient.user.count({ where: { id: actor.id } })).toBe(
      0,
    );
  });
});
