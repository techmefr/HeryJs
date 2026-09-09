import { readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { registerAndLogin } from '#devtools/testing/register-and-login';

describe('storage upload', () => {
  let app: INestApplication<App>;
  const writtenKeys: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await Promise.all(
      writtenKeys.flatMap((key) => [
        rm(path.resolve(process.cwd(), 'storage', key), {
          force: true,
          recursive: true,
        }),
        rm(path.resolve(process.cwd(), 'storage', `${key}.meta.json`), {
          force: true,
        }),
      ]),
    );
  });

  it('requires a session', async () => {
    await request(app.getHttpServer())
      .post('/storage/upload')
      .attach('file', Buffer.from('bytes'), {
        filename: 'evil.png',
        contentType: 'image/png',
      })
      .expect(401);
  });

  it('stores the upload and returns a key never derived from the filename', async () => {
    const user = await registerAndLogin(app);

    const response = await request(app.getHttpServer())
      .post('/storage/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: '../../etc/passwd',
        contentType: 'image/png',
      })
      .expect(201);

    const { data } = response.body as { data: { key: string; url: string } };
    writtenKeys.push(data.key);

    expect(data.key).toMatch(/^[^/]+\/[0-9a-f-]{36}\.png$/);
    expect(data.key).not.toContain('passwd');
    expect(data.url).toContain(encodeURIComponent(data.key));

    const stored = await readFile(
      path.resolve(process.cwd(), 'storage', data.key),
    );
    expect(stored.toString()).toBe('fake-png-bytes');
  });

  it('rejects a content type outside the allowlist', async () => {
    const user = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post('/storage/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'payload.html',
        contentType: 'text/html',
      })
      .expect(400);
  });

  it('rejects a request with no file part', async () => {
    const user = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post('/storage/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);
  });
});
