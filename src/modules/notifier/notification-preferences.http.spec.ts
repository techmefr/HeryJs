import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '@heryjs/core/auth';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import type { MailMessage } from '@heryjs/core/drivers';
import { setNotifierMailChannel } from '@heryjs/core/notifications';
import type { Notification } from './notification';
import { NotificationDigestService } from './notification-digest.service';
import { NotifierModule } from './notifier.module';
import { NotifierService } from './notifier.service';

interface RulesResponse {
  data: {
    rules: Array<{
      channel: string;
      type: string;
      enabled: boolean;
      digest: boolean;
    }>;
    settings: {
      timezone: string;
      quietHoursStart: string | null;
      quietHoursEnd: string | null;
      digestHour: number;
    };
  };
}

class Announcement implements Notification {
  readonly type: string = 'announcement';

  constructor(private readonly subject: string) {}

  toMail(): MailMessage {
    return { to: '', subject: this.subject, html: `<p>${this.subject}</p>` };
  }

  toInApp(): { payload: Record<string, unknown> } {
    return { payload: { subject: this.subject } };
  }
}

class PasswordReset extends Announcement {
  readonly type = 'password.reset';
  readonly isMandatory = true;
}

describe('notification preferences over a real HTTP round trip', () => {
  let app: INestApplication<App>;
  let notifier: NotifierService;
  let digests: NotificationDigestService;
  let sentMail: MailMessage[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, NotifierModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    notifier = app.get(NotifierService);
    digests = app.get(NotificationDigestService);
  });

  beforeEach(() => {
    sentMail = [];
    setNotifierMailChannel({
      send: async (mailable) => {
        const message = await mailable.build();
        sentMail.push({ ...message, to: mailable.to });
      },
    });
  });

  afterAll(async () => {
    setNotifierMailChannel(null);
    await app.close();
  });

  function as(user: TestUser, method: 'get' | 'put' | 'delete', path: string) {
    return request(app.getHttpServer())
      [method](`/notification-preferences${path}`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  async function tenantOf(user: TestUser): Promise<string> {
    const row = await authPrismaClient.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { tenantId: true },
    });

    return row.tenantId;
  }

  describe('reading and updating', () => {
    it('answers with defaults for a user who never set anything', async () => {
      const user = await registerAndLogin(app);

      const response = await as(user, 'get', '').expect(200);
      const { data } = response.body as RulesResponse;

      expect(data.rules).toEqual([]);
      expect(data.settings).toEqual({
        timezone: 'UTC',
        quietHoursStart: null,
        quietHoursEnd: null,
        digestHour: 8,
      });
    });

    it('requires a session', async () => {
      await request(app.getHttpServer())
        .get('/notification-preferences')
        .expect(401);
    });

    it('saves a rule, then updates it in place instead of duplicating it', async () => {
      const user = await registerAndLogin(app);
      const rule = { channel: 'sms', type: 'marketing', enabled: false };

      await as(user, 'put', '/rules')
        .send({ rules: [rule] })
        .expect(200);
      await as(user, 'put', '/rules')
        .send({ rules: [{ ...rule, enabled: true }] })
        .expect(200);

      const { data } = (await as(user, 'get', '').expect(200))
        .body as RulesResponse;

      expect(data.rules).toEqual([
        { channel: 'sms', type: 'marketing', enabled: true, digest: false },
      ]);
    });

    it('defaults the type to every notification on that channel', async () => {
      const user = await registerAndLogin(app);

      await as(user, 'put', '/rules')
        .send({ rules: [{ channel: 'push', enabled: false }] })
        .expect(200);

      const { data } = (await as(user, 'get', '').expect(200))
        .body as RulesResponse;

      expect(data.rules).toEqual([
        { channel: 'push', type: '*', enabled: false, digest: false },
      ]);
    });

    it('resets a rule back to the default', async () => {
      const user = await registerAndLogin(app);

      await as(user, 'put', '/rules')
        .send({ rules: [{ channel: 'mail', enabled: false }] })
        .expect(200);
      await as(user, 'delete', '/rules/mail/*').expect(200);

      const { data } = (await as(user, 'get', '').expect(200))
        .body as RulesResponse;

      expect(data.rules).toEqual([]);
    });

    it('rejects a digest on a channel that cannot hold one', async () => {
      const user = await registerAndLogin(app);

      await as(user, 'put', '/rules')
        .send({ rules: [{ channel: 'sms', enabled: true, digest: true }] })
        .expect(400);
    });

    it('rejects a body that names another user', async () => {
      const user = await registerAndLogin(app);
      const other = await registerAndLogin(app);

      await as(user, 'put', '/rules')
        .send({
          rules: [{ channel: 'mail', enabled: false }],
          userId: other.id,
        })
        .expect(400);
    });

    it('saves settings and rejects an unknown timezone or half a quiet window', async () => {
      const user = await registerAndLogin(app);
      const settings = {
        timezone: 'Europe/Paris',
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        digestHour: 9,
      };

      await as(user, 'put', '/settings').send(settings).expect(200);

      const { data } = (await as(user, 'get', '').expect(200))
        .body as RulesResponse;
      expect(data.settings).toEqual(settings);

      await as(user, 'put', '/settings')
        .send({ ...settings, timezone: 'Mars/Olympus' })
        .expect(400);
      await as(user, 'put', '/settings')
        .send({ ...settings, quietHoursEnd: null })
        .expect(400);
      await as(user, 'put', '/settings')
        .send({ ...settings, quietHoursEnd: '22:00' })
        .expect(400);
      await as(user, 'put', '/settings')
        .send({ ...settings, digestHour: 24 })
        .expect(400);
    });

    it('never shows one user the rules of another, in or across tenants', async () => {
      const owner = await registerAndLogin(app);
      const sameTenant = await registerAndLogin(app);
      const otherTenant = await registerAndLogin(app);

      await authPrismaClient.user.update({
        where: { id: otherTenant.id },
        data: { tenantId: 'tenant-elsewhere' },
      });

      await as(owner, 'put', '/rules')
        .send({ rules: [{ channel: 'mail', enabled: false }] })
        .expect(200);

      for (const stranger of [sameTenant, otherTenant]) {
        const { data } = (await as(stranger, 'get', '').expect(200))
          .body as RulesResponse;

        expect(data.rules).toEqual([]);
      }
    });
  });

  describe('being honoured when notifying', () => {
    async function recipientFor(user: TestUser) {
      return {
        userId: user.id,
        email: user.email,
        tenantId: await tenantOf(user),
      };
    }

    it('skips a channel the user opted out of and delivers the rest', async () => {
      const user = await registerAndLogin(app);

      await as(user, 'put', '/rules')
        .send({
          rules: [{ channel: 'mail', type: 'announcement', enabled: false }],
        })
        .expect(200);

      const results = await notifier.send(
        await recipientFor(user),
        new Announcement('Hello'),
      );

      expect(results).toEqual([
        {
          channel: 'mail',
          status: 'skipped',
          reason: 'Recipient opted out of announcement on mail.',
        },
        { channel: 'in-app', status: 'delivered' },
      ]);
      expect(sentMail).toEqual([]);
    });

    it('delivers a mandatory notification to someone who opted out of everything', async () => {
      const user = await registerAndLogin(app);

      await as(user, 'put', '/rules')
        .send({
          rules: [
            { channel: 'mail', enabled: false },
            { channel: 'in-app', enabled: false },
          ],
        })
        .expect(200);

      const results = await notifier.send(
        await recipientFor(user),
        new PasswordReset('Reset your password'),
      );

      expect(results).toEqual([
        { channel: 'mail', status: 'delivered' },
        { channel: 'in-app', status: 'delivered' },
      ]);
      expect(sentMail.map((message) => message.subject)).toEqual([
        'Reset your password',
      ]);
    });

    it('collects mail into one summary sent at the chosen local hour', async () => {
      const user = await registerAndLogin(app);
      const recipient = await recipientFor(user);

      await as(user, 'put', '/rules')
        .send({ rules: [{ channel: 'mail', enabled: true, digest: true }] })
        .expect(200);
      await as(user, 'put', '/settings')
        .send({
          timezone: 'Asia/Tokyo',
          quietHoursStart: null,
          quietHoursEnd: null,
          digestHour: 9,
        })
        .expect(200);

      const first = await notifier.send(recipient, new Announcement('One <b>'));
      await notifier.send(recipient, new Announcement('Two'));

      expect(first).toContainEqual({
        channel: 'mail',
        status: 'queued',
        reason: 'Held for the next digest.',
      });
      expect(sentMail).toEqual([]);

      const eightInTokyo = new Date('2026-10-21T23:00:00Z');
      await digests.flushDue(eightInTokyo);
      expect(sentMail).toEqual([]);

      const nineInTokyo = new Date('2026-10-22T00:00:00Z');
      await digests.flushDue(nineInTokyo);

      expect(sentMail).toHaveLength(1);
      expect(sentMail[0]?.to).toBe(user.email);
      expect(sentMail[0]?.subject).toBe('You have 2 new notifications');
      expect(sentMail[0]?.html).toContain('<li>One &lt;b&gt;</li>');
      expect(sentMail[0]?.html).toContain('<li>Two</li>');

      await digests.flushDue(nineInTokyo);
      expect(sentMail).toHaveLength(1);
    });

    it('keeps held entries when the summary could not be sent', async () => {
      const user = await registerAndLogin(app);
      const recipient = await recipientFor(user);

      await as(user, 'put', '/rules')
        .send({ rules: [{ channel: 'mail', enabled: true, digest: true }] })
        .expect(200);
      await notifier.send(recipient, new Announcement('Kept'));

      setNotifierMailChannel({
        send: () => Promise.reject(new Error('smtp down')),
      });

      const noonUtc = new Date('2026-10-21T08:00:00Z');
      await expect(digests.flushDue(noonUtc)).rejects.toThrow(
        'digest(s) could not be sent',
      );

      const remaining = await authPrismaClient.notificationDigestEntry.count({
        where: { userId: user.id },
      });
      expect(remaining).toBe(1);
    });
  });
});
