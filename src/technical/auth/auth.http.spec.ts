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
import { AuthModule } from './auth.module';
import { RequestWithUser, SessionGuard } from './session.guard';

@Controller('protected')
class ProtectedController {
  @Get()
  @UseGuards(SessionGuard)
  read(@Req() req: RequestWithUser) {
    return { userId: req.user.id };
  }
}

describe('auth over a real HTTP round trip', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProtectedController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const email = `${randomUUID()}@example.test`;
  const password = 'correct-horse-battery-staple';

  it('rejects a protected route without a session', async () => {
    await request(app.getHttpServer()).get('/protected').expect(401);
  });

  it('registers, logs in, and reaches a protected route with the session token', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const token = (loginResponse.body as { token: string }).token;
    expect(token).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('rejects a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });
});
