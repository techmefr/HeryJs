import {
  Controller,
  Get,
  INestApplication,
  Module,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { AuthModule } from '@heryjs/core/auth';
import { SessionGuard } from '@heryjs/core/auth';
import { authPrismaClient } from '@heryjs/core/auth';
import { databaseOwnerClient } from '#devtools/testing/database-owner-client';
import { PublicRoute } from '@heryjs/core/capabilities';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { decryptSecret } from './secret-cipher';
import { base32Decode, hotp, stepAt } from './totp';
import { TwoFactorGuard } from './two-factor.guard';
import { TwoFactorModule } from './two-factor.module';

@Controller('two-factor-probe')
@UseGuards(SessionGuard, TwoFactorGuard)
class ProbeController {
  @Get()
  @PublicRoute(
    'a spec probe: SessionGuard has already authenticated the caller',
  )
  reach() {
    return { reached: true };
  }
}

@Module({
  imports: [AuthModule, TwoFactorModule],
  controllers: [ProbeController],
})
class ProbeModule {}

const PASSWORD = 'correct-horse-battery-staple';
const STEP_MS = 30_000;

describe('Two-factor authentication', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TwoFactorModule, ProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (
    user: TestUser,
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${user.token}`);

  const loginAgain = async (user: TestUser): Promise<TestUser> => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(201);

    return {
      ...user,
      token: (login.body as { data: { token: string } }).data.token,
    };
  };

  const currentCode = async (
    user: TestUser,
    atMs: number = Date.now(),
  ): Promise<string> => {
    const enrolment =
      await databaseOwnerClient.twoFactorEnrolment.findUniqueOrThrow({
        where: { userId: user.id },
      });

    return hotp(base32Decode(decryptSecret(enrolment.secret)), stepAt(atMs));
  };

  const enrol = async (user: TestUser): Promise<string[]> => {
    await authed(user, 'post', '/two-factor/enrolment').expect(201);
    const confirmed = await authed(
      user,
      'post',
      '/two-factor/enrolment/confirm',
    )
      .send({ code: await currentCode(user) })
      .expect(200);

    return (confirmed.body as { data: { recoveryCodes: string[] } }).data
      .recoveryCodes;
  };

  it('refuses an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/two-factor').expect(401);
    await request(app.getHttpServer())
      .post('/two-factor/verify')
      .send({ code: '123456' })
      .expect(401);
  });

  it('does not count an enrolment until a first code has been verified', async () => {
    const user = await registerAndLogin(app);
    await authed(user, 'post', '/two-factor/enrolment').expect(201);

    await authed(user, 'post', '/two-factor/enrolment/confirm')
      .send({ code: '000000' })
      .expect(400);

    const status = await authed(user, 'get', '/two-factor').expect(200);
    expect(
      (status.body as { data: { isEnrolled: boolean } }).data.isEnrolled,
    ).toBe(false);
    await authed(user, 'get', '/two-factor-probe').expect(200);
  });

  it('asks an enrolled user for the second factor on every new session', async () => {
    const user = await registerAndLogin(app);
    const recoveryCodes = await enrol(user);

    expect(recoveryCodes).toHaveLength(10);
    await authed(user, 'get', '/two-factor-probe').expect(200);

    const next = await loginAgain(user);
    await authed(next, 'get', '/two-factor-probe').expect(403);

    await authed(next, 'post', '/two-factor/verify')
      .send({ code: await currentCode(user, Date.now() + STEP_MS) })
      .expect(200);
    await authed(next, 'get', '/two-factor-probe').expect(200);
  });

  it('refuses a code that was already used', async () => {
    const user = await registerAndLogin(app);
    await enrol(user);
    const code = await currentCode(user, Date.now() + STEP_MS);

    await authed(await loginAgain(user), 'post', '/two-factor/verify')
      .send({ code })
      .expect(200);
    await authed(await loginAgain(user), 'post', '/two-factor/verify')
      .send({ code })
      .expect(400);
  });

  it('accepts each recovery code once', async () => {
    const user = await registerAndLogin(app);
    const [recoveryCode] = await enrol(user);

    await authed(await loginAgain(user), 'post', '/two-factor/verify')
      .send({ recoveryCode })
      .expect(200);
    await authed(await loginAgain(user), 'post', '/two-factor/verify')
      .send({ recoveryCode })
      .expect(400);
  });

  it('never stores a recovery code or a secret readable', async () => {
    const user = await registerAndLogin(app);
    const recoveryCodes = await enrol(user);
    const stored = await databaseOwnerClient.twoFactorRecoveryCode.findMany({
      where: { userId: user.id },
    });
    const enrolment =
      await databaseOwnerClient.twoFactorEnrolment.findUniqueOrThrow({
        where: { userId: user.id },
      });

    stored.forEach((row) => expect(recoveryCodes).not.toContain(row.codeHash));
    expect(enrolment.secret.startsWith('v1.')).toBe(true);
  });

  it('keeps a user out of a guarded route when their role requires a factor they have not set up', async () => {
    const admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
    await authed(admin, 'put', '/two-factor/requirements/admin').expect(200);

    await authed(admin, 'get', '/two-factor-probe').expect(403);

    await authed(admin, 'post', '/two-factor/enrolment').expect(201);
    await authed(admin, 'post', '/two-factor/enrolment/confirm')
      .send({ code: await currentCode(admin) })
      .expect(200);
    await authed(admin, 'get', '/two-factor-probe').expect(200);
    await authed(admin, 'post', '/two-factor/disable')
      .send({ code: await currentCode(admin, Date.now() + STEP_MS) })
      .expect(409);
  });

  it('keeps the requirement routes for an admin', async () => {
    const user = await registerAndLogin(app);

    await authed(user, 'put', '/two-factor/requirements/admin').expect(403);
    await authed(user, 'get', '/two-factor/requirements').expect(403);
  });
});
