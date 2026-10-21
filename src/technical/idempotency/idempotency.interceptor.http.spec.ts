import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';

interface TeamResponse {
  data: { id: string; name: string };
}

interface TeamListResponse {
  data: { id: string; name: string }[];
}

/**
 * Exercised against a real generated-style mutating route (`POST /teams`)
 * rather than a hand-rolled controller: the interceptor is wired
 * framework-wide, so proving it here proves it for every mutating route the
 * same way, with a real Postgres row backing the record and a real Redis
 * lock backing the concurrency guarantee -- nothing here is mocked.
 */
describe('IdempotencyInterceptor over a real HTTP round trip', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createTeam(
    user: TestUser,
    key: string,
    name: string,
  ): Promise<request.Response> {
    return request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${user.token}`)
      .set('Idempotency-Key', key)
      .send({ name });
  }

  async function teamCount(user: TestUser): Promise<number> {
    const response = await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    return (response.body as TeamListResponse).data.length;
  }

  it('executes the handler and stores the response on a first request', async () => {
    const user = await registerAndLogin(app);

    const response = await createTeam(user, 'first-seen', 'Acme');
    expect(response.status).toBe(201);

    const body = response.body as TeamResponse;
    expect(body.data.name).toBe('Acme');
    expect(await teamCount(user)).toBe(1);
  });

  it('replays the stored response on a repeat, without re-running the handler', async () => {
    const user = await registerAndLogin(app);

    const first = await createTeam(user, 'replay-key', 'Acme');
    expect(first.status).toBe(201);

    const second = await createTeam(user, 'replay-key', 'Acme');
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    expect(await teamCount(user)).toBe(1);
  });

  it('answers a repeat with a different body as a 422, not a replay', async () => {
    const user = await registerAndLogin(app);

    const first = await createTeam(user, 'mismatch-key', 'Acme');
    expect(first.status).toBe(201);

    const second = await createTeam(
      user,
      'mismatch-key',
      'A Different Company',
    );
    expect(second.status).toBe(422);

    const body = second.body as { error: { key: string } };
    expect(body.error.key).toBe('idempotency.mismatch');
    expect(await teamCount(user)).toBe(1);
  });

  /**
   * Real Redis, not a mocked LockService: the whole point of the lock is to
   * make two genuinely concurrent requests race for it, which a stub cannot
   * exercise honestly.
   */
  it('executes the handler only once for concurrent requests sharing a key', async () => {
    const user = await registerAndLogin(app);

    const [first, second] = await Promise.all([
      createTeam(user, 'concurrent-key', 'Acme'),
      createTeam(user, 'concurrent-key', 'Acme'),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body).toEqual(second.body);
    expect(await teamCount(user)).toBe(1);
  });

  it('runs the handler every time when no key is sent', async () => {
    const user = await registerAndLogin(app);

    for (const name of ['One', 'Two']) {
      await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name })
        .expect(201);
    }

    expect(await teamCount(user)).toBe(2);
  });

  it('keeps the same key from colliding across tenants', async () => {
    const first = await registerAndLogin(app);
    const second = await registerAndLogin(app);

    const firstResponse = await createTeam(first, 'shared-key', 'Acme');
    const secondResponse = await createTeam(second, 'shared-key', 'Globex');

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect((secondResponse.body as TeamResponse).data.name).toBe('Globex');
  });

  it('does not store a failed response, so a retry runs the handler again', async () => {
    const user = await registerAndLogin(app);

    const failed = await createTeam(user, 'failing-key', '');
    expect(failed.status).toBeGreaterThanOrEqual(400);

    const retried = await createTeam(user, 'failing-key', '');
    expect(retried.status).toBe(failed.status);
  });
});
