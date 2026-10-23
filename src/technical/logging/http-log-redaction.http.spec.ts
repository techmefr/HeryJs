import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from '#technical/auth/auth.module';
import { httpLogRedaction } from './http-log-redaction';

const PASSWORD = 'correct-horse-battery-staple';

describe('http request logs over a real sign-in', () => {
  let app: INestApplication<App>;
  let lines: string[];

  beforeAll(async () => {
    lines = [];
    const capture = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: [{ level: 'info', ...httpLogRedaction }, capture],
        }),
        AuthModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function sessionSecrets(response: request.Response): string[] {
    const cookies = ([] as string[]).concat(
      (response.headers['set-cookie'] as string[] | string | undefined) ?? [],
    );
    const values = cookies.map((cookie) => {
      const [pair = ''] = cookie.split(';');
      return decodeURIComponent(pair.slice(pair.indexOf('=') + 1));
    });
    const authToken = response.headers['set-auth-token'];
    return [...values, ...(authToken ? [authToken] : [])].filter(
      (value) => value.length > 0,
    );
  }

  it('keeps the session cookie, the auth token and the bearer out of every log line', async () => {
    const email = `${randomUUID()}@example.test`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);

    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email, password: PASSWORD })
      .expect(200);
    const secrets = sessionSecrets(signIn);
    expect(secrets.length).toBeGreaterThan(0);

    const cookieHeader = ([] as string[])
      .concat(signIn.headers['set-cookie'] as string[] | string)
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    const getSession = await request(app.getHttpServer())
      .get('/api/auth/get-session')
      .set('Cookie', cookieHeader)
      .expect(200);
    secrets.push(...sessionSecrets(getSession));

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    const bearer = (login.body as { data: { token: string } }).data.token;
    secrets.push(bearer);
    await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);

    const output = lines.join('');
    expect(output).toContain('/api/auth/sign-in/email');
    expect(output).toContain('"set-cookie"');
    for (const secret of secrets) {
      expect(output).not.toContain(secret);
      expect(output).not.toContain(encodeURIComponent(secret));
    }
  });
});
