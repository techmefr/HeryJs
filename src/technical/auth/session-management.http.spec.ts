import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { env } from '#technical/config/env';
import { AuthModule } from './auth.module';

const PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'a-different-staple-battery';

interface SessionRow {
  id: string;
  isCurrent: boolean;
}

describe('session management over a real HTTP round trip', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function register(): Promise<string> {
    const email = `${randomUUID()}@example.test`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    return email;
  }

  async function login(email: string, password = PASSWORD): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    return (response.body as { data: { token: string } }).data.token;
  }

  async function listSessions(token: string): Promise<SessionRow[]> {
    const response = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (response.body as { data: SessionRow[] }).data;
  }

  function status(token: string): Promise<number> {
    return request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${token}`)
      .then((response) => response.status);
  }

  describe('listing and revoking', () => {
    it('lists every live session, flags the current one, and never shows a token', async () => {
      const email = await register();
      const first = await login(email);
      const second = await login(email);

      const response = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${second}`)
        .expect(200);

      const rows = (response.body as { data: SessionRow[] }).data;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.filter((row) => row.isCurrent)).toHaveLength(1);
      expect(JSON.stringify(response.body)).not.toContain(first);
      expect(JSON.stringify(response.body)).not.toContain(second);
    });

    it('revokes one session and leaves the others alone', async () => {
      const email = await register();
      const kept = await login(email);
      const doomed = await login(email);

      const rows = await listSessions(doomed);
      const doomedRow = rows.find((row) => row.isCurrent) as SessionRow;

      await request(app.getHttpServer())
        .delete(`/auth/sessions/${doomedRow.id}`)
        .set('Authorization', `Bearer ${kept}`)
        .expect(200);

      expect(await status(doomed)).toBe(401);
      expect(await status(kept)).toBe(200);
    });

    it("answers 404 for another user's session, as if it did not exist", async () => {
      const mine = await login(await register());
      const theirs = await login(await register());
      const theirRow = (await listSessions(theirs))[0] as SessionRow;

      await request(app.getHttpServer())
        .delete(`/auth/sessions/${theirRow.id}`)
        .set('Authorization', `Bearer ${mine}`)
        .expect(404);

      expect(await status(theirs)).toBe(200);
    });

    it('signs out every other session and keeps the current one', async () => {
      const email = await register();
      const current = await login(email);
      const other = await login(email);

      const response = await request(app.getHttpServer())
        .delete('/auth/sessions/others')
        .set('Authorization', `Bearer ${current}`)
        .expect(200);

      expect(
        (response.body as { data: { revoked: number } }).data.revoked,
      ).toBeGreaterThanOrEqual(1);
      expect(await status(other)).toBe(401);
      expect(await status(current)).toBe(200);
      expect(await listSessions(current)).toHaveLength(1);
    });

    it('signs out everywhere, including the session that asked', async () => {
      const email = await register();
      const current = await login(email);
      const other = await login(email);

      await request(app.getHttpServer())
        .delete('/auth/sessions')
        .set('Authorization', `Bearer ${current}`)
        .expect(200);

      expect(await status(current)).toBe(401);
      expect(await status(other)).toBe(401);
    });

    it('requires a session at all', async () => {
      await request(app.getHttpServer()).get('/auth/sessions').expect(401);
    });

    it('refuses an API key on every route that touches sessions or the password', async () => {
      const session = await login(await register());
      const created = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${session}`)
        .send({ name: 'ci' })
        .expect(201);
      const key = (created.body as { data: { key: string } }).data.key;
      const auth = { Authorization: `Bearer ${key}` };

      await request(app.getHttpServer())
        .get('/auth/sessions')
        .set(auth)
        .expect(403);
      await request(app.getHttpServer())
        .delete('/auth/sessions')
        .set(auth)
        .expect(403);
      await request(app.getHttpServer())
        .delete('/auth/sessions/others')
        .set(auth)
        .expect(403);
      await request(app.getHttpServer())
        .delete('/auth/sessions/x')
        .set(auth)
        .expect(403);
      const response = await request(app.getHttpServer())
        .post('/auth/password/change')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(403);

      expect((response.body as { message: string }).message).toBe(
        'An API key cannot manage sessions or passwords.',
      );
      expect(await status(session)).toBe(200);
    });
  });

  describe('changing the password', () => {
    it('signs out every other session and hands back a working token', async () => {
      const email = await register();
      const current = await login(email);
      const other = await login(email);

      const response = await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('Authorization', `Bearer ${current}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(201);

      const { token } = (response.body as { data: { token: string } }).data;
      expect(await status(other)).toBe(401);
      expect(await status(token)).toBe(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(401);
      await login(email, NEW_PASSWORD);
    });

    it('refuses a wrong current password and changes nothing', async () => {
      const email = await register();
      const current = await login(email);
      const other = await login(email);

      const response = await request(app.getHttpServer())
        .post('/auth/password/change')
        .set('Authorization', `Bearer ${current}`)
        .send({
          currentPassword: 'not-the-password',
          newPassword: NEW_PASSWORD,
        })
        .expect(400);

      expect((response.body as { message: string }).message).toBe(
        'The current password is incorrect.',
      );
      expect(await status(other)).toBe(200);
      await login(email);
    });

    it("revokes the other sessions even when Better Auth's own route is called without asking", async () => {
      const email = await register();
      const current = await login(email);
      const other = await login(email);

      await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${current}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      expect(await status(other)).toBe(401);
    });
  });

  describe('lockout after repeated failures', () => {
    async function failTimes(email: string, times: number): Promise<void> {
      for (let attempt = 0; attempt < times; attempt += 1) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'wrong-password' })
          .expect(401);
      }
    }

    it('locks the account once the limit is reached, even for the right password', async () => {
      const email = await register();
      await failTimes(email, env.AUTH_LOCKOUT_MAX_ATTEMPTS);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(429);

      expect((response.body as { message: string }).message).toBe(
        'Too many failed sign-in attempts. Try again later.',
      );
    });

    it("locks Better Auth's own sign-in route too, with Retry-After", async () => {
      const email = await register();
      await failTimes(email, env.AUTH_LOCKOUT_MAX_ATTEMPTS);

      const response = await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email, password: PASSWORD })
        .expect(429);

      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('counts an address that does not exist exactly like one that does', async () => {
      const email = `${randomUUID()}@example.test`;
      await failTimes(email, env.AUTH_LOCKOUT_MAX_ATTEMPTS);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(429);
    });

    it('does not lock below the limit, and a success resets the count', async () => {
      const email = await register();
      const belowLimit = env.AUTH_LOCKOUT_MAX_ATTEMPTS - 1;

      await failTimes(email, belowLimit);
      await login(email);
      await failTimes(email, belowLimit);
      await login(email);
    });

    it('is case-insensitive about the address', async () => {
      const email = await register();
      await failTimes(email.toUpperCase(), env.AUTH_LOCKOUT_MAX_ATTEMPTS);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(429);
    });
  });
});
