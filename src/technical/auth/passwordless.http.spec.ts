import '../../../test/passwordless-env';
import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  INestApplication,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import type { NextFunction, Request, Response } from 'express';
import type { RateLimitHit } from '#technical/rate-limit/rate-limit-store';
import type { Mailable } from '#technical/mail/mail-driver';
import type { SmsMessage } from '#technical/sms/sms-driver';
import { env } from '#technical/config/env';
import { RateLimitStore } from '#technical/rate-limit/rate-limit-store';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { AuthModule } from './auth.module';
import { setAuthMailer } from './auth-mailer';
import { setAuthSmsSender } from './auth-sms';
import { authPrismaClient as prisma } from './better-auth.instance';
import { SessionGuard } from './session.guard';
import type { RequestWithUser } from './session.guard';

interface SessionBody {
  token: string;
  user: { id: string };
}

describe('passwordless sign-in over a real HTTP round trip', () => {
  let app: INestApplication<App>;
  let sentMail: Array<{ to: string; html: string }>;
  let sentSms: SmsMessage[];

  beforeAll(async () => {
    @Controller('protected')
    class ProtectedController {
      @Get()
      @UseGuards(SessionGuard)
      read(@Req() req: RequestWithUser) {
        return { userId: req.user.id, tenantId: req.user.tenantId };
      }
    }

    const counts = new Map<string, number>();
    const memoryStore = {
      hit: (key: string, limit: number): Promise<RateLimitHit> => {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);

        return Promise.resolve({
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          retryAfterSeconds: 60,
        });
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProtectedController],
    })
      .overrideProvider(RateLimitStore)
      .useValue(memoryStore)
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.use((_req: Request, _res: Response, next: NextFunction) => {
      TenantContextStorage.run({ tenantId: 'default' }, () => next());
    });
    await app.init();

    sentMail = [];
    sentSms = [];
    setAuthMailer({
      send: async (mailable: Mailable): Promise<void> => {
        const message = await Promise.resolve(mailable.build());
        sentMail.push({ to: message.to, html: message.html });
      },
    });
    setAuthSmsSender({
      send: (message: SmsMessage): Promise<void> => {
        sentSms.push(message);
        return Promise.resolve();
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  function lastMailTo(email: string): string {
    const mail = [...sentMail].reverse().find((entry) => entry.to === email);

    if (!mail) {
      throw new Error(`no email was sent to ${email}`);
    }

    return mail.html;
  }

  function codeIn(html: string): string {
    const match = /<strong>(\d+)<\/strong>/.exec(html);

    if (!match?.[1]) {
      throw new Error('no code in the email');
    }

    return match[1];
  }

  async function whoAmI(token: string) {
    const response = await request(server())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return response.body as { userId: string; tenantId: string };
  }

  it('signs in with a magic link, once, and lands in the default tenant', async () => {
    const email = `${randomUUID()}@example.test`;

    await request(server())
      .post('/api/auth/sign-in/magic-link')
      .send({ email })
      .expect(200);

    const link = /href="([^"]+)"/.exec(lastMailTo(email))?.[1] ?? '';
    const { pathname, search } = new URL(link);

    const verified = await request(server())
      .get(`${pathname}${search}`)
      .expect(302);
    const token = String(verified.headers['set-auth-token']);

    expect((await whoAmI(token)).tenantId).toBe('default');

    const replay = await request(server())
      .get(`${pathname}${search}`)
      .expect(302);

    expect(replay.headers['set-auth-token']).toBeUndefined();
    expect(String(replay.headers.location)).toContain('error=');
  });

  it('signs in with an email code and refuses the code after too many wrong guesses', async () => {
    const email = `${randomUUID()}@example.test`;

    await request(server())
      .post('/api/auth/email-otp/send-verification-otp')
      .send({ email, type: 'sign-in' })
      .expect(200);

    const code = codeIn(lastMailTo(email));
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(server())
        .post('/api/auth/sign-in/email-otp')
        .send({ email, otp: wrong })
        .expect(400);
    }

    await request(server())
      .post('/api/auth/sign-in/email-otp')
      .send({ email, otp: code })
      .expect(403);
  });

  it('signs in with an email code', async () => {
    const email = `${randomUUID()}@example.test`;

    await request(server())
      .post('/api/auth/email-otp/send-verification-otp')
      .send({ email, type: 'sign-in' })
      .expect(200);

    const signedIn = await request(server())
      .post('/api/auth/sign-in/email-otp')
      .send({ email, otp: codeIn(lastMailTo(email)) })
      .expect(200);
    const session = signedIn.body as SessionBody;

    expect((await whoAmI(session.token)).tenantId).toBe('default');
  });

  it('signs in with a phone code, creating the account on first verification', async () => {
    const phoneNumber = `+3367${Math.floor(1000000 + Math.random() * 8999999)}`;

    await request(server())
      .post('/api/auth/phone-number/send-otp')
      .send({ phoneNumber })
      .expect(200);

    const message = sentSms.find((sms) => sms.to === phoneNumber);
    const code = /(\d{6})/.exec(message?.body ?? '')?.[1] ?? '';

    const verified = await request(server())
      .post('/api/auth/phone-number/verify')
      .send({ phoneNumber, code })
      .expect(200);
    const session = verified.body as { token: string };

    expect((await whoAmI(session.token)).tenantId).toBe('default');

    const stored = await prisma.user.findUniqueOrThrow({
      where: { phoneNumber },
    });
    expect(stored.phoneNumberVerified).toBe(true);
  });

  it('caps how many links and codes one recipient can be sent, whoever asks', async () => {
    const email = `${randomUUID()}@example.test`;
    const before = sentMail.length;

    env.RATE_LIMIT_DISABLED = false;

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await request(server())
          .post('/api/auth/sign-in/magic-link')
          .send({ email })
          .expect(200);
      }

      await request(server())
        .post('/api/auth/sign-in/magic-link')
        .send({ email: email.toUpperCase() })
        .expect(429);
      await request(server())
        .post('/api/auth/email-otp/send-verification-otp')
        .send({ email, type: 'sign-in' })
        .expect(429);
    } finally {
      env.RATE_LIMIT_DISABLED = true;
    }

    expect(sentMail.length - before).toBe(3);
  });

  it('hands a signed-in user passkey registration options for the configured relying party', async () => {
    const email = `${randomUUID()}@example.test`;

    await request(server())
      .post('/api/auth/email-otp/send-verification-otp')
      .send({ email, type: 'sign-in' })
      .expect(200);

    const signedIn = await request(server())
      .post('/api/auth/sign-in/email-otp')
      .send({ email, otp: codeIn(lastMailTo(email)) })
      .expect(200);
    const { token } = signedIn.body as SessionBody;

    await request(server())
      .get('/api/auth/passkey/generate-register-options')
      .expect(401);

    const options = await request(server())
      .get('/api/auth/passkey/generate-register-options')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(options.body).toMatchObject({
      rp: { id: 'localhost' },
      user: { name: email },
    });

    const listed = await request(server())
      .get('/api/auth/passkey/list-user-passkeys')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listed.body).toEqual([]);
  });

  it('hands anyone passkey sign-in options without creating anything', async () => {
    const options = await request(server())
      .get('/api/auth/passkey/generate-authenticate-options')
      .expect(200);

    expect(options.body).toMatchObject({ rpId: 'localhost' });
    expect(typeof (options.body as { challenge: string }).challenge).toBe(
      'string',
    );
  });

  it('refuses a phone number that is not E.164 before sending anything', async () => {
    const before = sentSms.length;

    await request(server())
      .post('/api/auth/phone-number/send-otp')
      .send({ phoneNumber: '0612345678' })
      .expect(400);

    expect(sentSms).toHaveLength(before);
  });

  it('gives a guest a real session, and moves what they made to the account they sign in to', async () => {
    const guestSignIn = await request(server())
      .post('/api/auth/sign-in/anonymous')
      .send({})
      .expect(200);
    const guest = guestSignIn.body as SessionBody;

    expect((await whoAmI(guest.token)).tenantId).toBe('default');

    const post = await prisma.blogPost.create({
      data: { tenantId: 'default', ownerId: guest.user.id, title: 'guest' },
    });

    const email = `${randomUUID()}@example.test`;

    await request(server())
      .post('/api/auth/email-otp/send-verification-otp')
      .send({ email, type: 'sign-in' })
      .expect(200);

    const upgraded = await request(server())
      .post('/api/auth/sign-in/email-otp')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ email, otp: codeIn(lastMailTo(email)) })
      .expect(200);
    const account = upgraded.body as SessionBody;

    const moved = await prisma.blogPost.findUniqueOrThrow({
      where: { id: post.id },
    });

    expect(moved.ownerId).toBe(account.user.id);
    expect(
      await prisma.user.findUnique({ where: { id: guest.user.id } }),
    ).toBeNull();
  });

  it('does not carry a guest across a tenant boundary', async () => {
    const guestSignIn = await request(server())
      .post('/api/auth/sign-in/anonymous')
      .send({})
      .expect(200);
    const guest = guestSignIn.body as SessionBody;

    const email = `${randomUUID()}@example.test`;

    await request(server())
      .post('/api/auth/email-otp/send-verification-otp')
      .send({ email, type: 'sign-in' })
      .expect(200);
    await request(server())
      .post('/api/auth/sign-in/email-otp')
      .send({ email, otp: codeIn(lastMailTo(email)) })
      .expect(200);
    await prisma.user.update({
      where: { email },
      data: { tenantId: 'other-tenant' },
    });
    await request(server())
      .post('/api/auth/email-otp/send-verification-otp')
      .send({ email, type: 'sign-in' })
      .expect(200);

    const post = await prisma.blogPost.create({
      data: { tenantId: 'default', ownerId: guest.user.id, title: 'guest' },
    });

    const upgraded = await request(server())
      .post('/api/auth/sign-in/email-otp')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ email, otp: codeIn(lastMailTo(email)) })
      .expect(200);
    const account = upgraded.body as SessionBody;

    expect((await whoAmI(account.token)).tenantId).toBe('other-tenant');
    expect(
      await prisma.blogPost.findUnique({ where: { id: post.id } }),
    ).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: guest.user.id } }),
    ).toBeNull();
  });
});
