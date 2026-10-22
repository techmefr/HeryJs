import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import { grantPlatformOperator } from '#devtools/testing/platform-operator';
import { env } from '#technical/config/env';
import { databaseNameOf } from './database-backup';

interface Row {
  name: string;
  sizeBytes: number;
  status: string;
}

describe('backup routes', () => {
  const dump = `${databaseNameOf(env.DATABASE_URL)}-20260101T000000Z.dump`;
  let app: INestApplication<App>;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
    grantPlatformOperator(admin.id);
    adminToken = admin.token;
    userToken = (await registerAndLogin(app)).token;

    await mkdir(env.BACKUP_DIR, { recursive: true });
    await writeFile(path.join(env.BACKUP_DIR, dump), 'not a real dump');
  });

  afterAll(async () => {
    await rm(path.join(env.BACKUP_DIR, dump), { force: true });
    await rm(path.join(env.BACKUP_DIR, 'settings.json'), { force: true });
    await app.close();
  });

  it('refuses a non-admin caller on every route', async () => {
    const bearer = `Bearer ${userToken}`;

    await request(app.getHttpServer())
      .get('/backups')
      .set('Authorization', bearer)
      .expect(403);
    await request(app.getHttpServer())
      .post('/backups')
      .set('Authorization', bearer)
      .expect(403);
    await request(app.getHttpServer())
      .put('/backups/schedule')
      .set('Authorization', bearer)
      .send({ enabled: true, cron: '0 3 * * *', keep: 3 })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/backups/${dump}/download`)
      .set('Authorization', bearer)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/backups/${dump}/restore`)
      .set('Authorization', bearer)
      .send({ confirm: dump })
      .expect(403);
  });

  it('lists a dump with its size, date and status', async () => {
    const response = await request(app.getHttpServer())
      .get('/backups')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect((response.body as { data: Row[] }).data).toContainEqual(
      expect.objectContaining({
        name: dump,
        sizeBytes: 'not a real dump'.length,
        status: 'available',
      }),
    );
  });

  it('downloads a dump, and answers 404 for a name that is not one', async () => {
    const response = await request(app.getHttpServer())
      .get(`/backups/${dump}/download`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.headers['content-disposition']).toContain(dump);

    await request(app.getHttpServer())
      .get('/backups/..%2F..%2Fpackage.json/download')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('refuses a restore whose confirmation is not the dump name', async () => {
    await request(app.getHttpServer())
      .post(`/backups/${dump}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirm: 'yes' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/backups/missing.dump/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirm: 'missing.dump' })
      .expect(404);
  });

  it('edits the schedule and retention, and rejects a bad cron expression', async () => {
    await request(app.getHttpServer())
      .put('/backups/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true, cron: 'every day', keep: 3 })
      .expect(400);

    await request(app.getHttpServer())
      .put('/backups/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false, cron: '30 2 * * *', keep: 3 })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/backups/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect((response.body as { data: unknown }).data).toMatchObject({
      enabled: false,
      cron: '30 2 * * *',
      keep: 3,
    });
  });
});
