import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import {
  registerAndLogin,
  type TestUser,
} from '#devtools/testing/register-and-login';

interface AgencySeedResult {
  team: string;
  createdUserIds: string[];
}

describe('agency seeder', () => {
  let app: INestApplication<App>;
  let admin: TestUser;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    admin = await registerAndLogin(app);
    await authPrismaClient.user.update({
      where: { id: admin.id },
      data: { role: 'admin' },
    });
    adminToken = admin.token;

    userToken = (await registerAndLogin(app)).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a non-admin caller', async () => {
    await request(app.getHttpServer())
      .post('/expose/agency.seed')
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(403);
  });

  it('refuses a count outside its declared bounds', async () => {
    await request(app.getHttpServer())
      .post('/expose/agency.seed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        'agency.seed.agency': `bounds-agency-${randomUUID()}`,
        'agency.seed.count': 0,
      })
      .expect(400);
  });

  it('creates the team and the requested number of users', async () => {
    const agency = `acme-agency-${randomUUID()}`;

    const response = await request(app.getHttpServer())
      .post('/expose/agency.seed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ 'agency.seed.agency': agency, 'agency.seed.count': 3 })
      .expect(201);

    const result = (response.body as { data: AgencySeedResult }).data;
    expect(result.team).toBe(agency);
    expect(result.createdUserIds).toHaveLength(3);

    const team = await authPrismaClient.team.findFirst({
      where: { tenantId: 'default', name: agency },
    });
    expect(team).not.toBeNull();

    const members = await authPrismaClient.teamMember.findMany({
      where: { teamId: team!.id },
    });
    expect(members).toHaveLength(3);
    expect(members.map((member) => member.userId).sort()).toEqual(
      [...result.createdUserIds].sort(),
    );
  });

  it('reuses the same team on a second run instead of duplicating it', async () => {
    const agency = `repeat-agency-${randomUUID()}`;

    await request(app.getHttpServer())
      .post('/expose/agency.seed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ 'agency.seed.agency': agency, 'agency.seed.count': 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/expose/agency.seed')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ 'agency.seed.agency': agency, 'agency.seed.count': 2 })
      .expect(201);

    const teams = await authPrismaClient.team.findMany({
      where: { tenantId: 'default', name: agency },
    });
    expect(teams).toHaveLength(1);

    const members = await authPrismaClient.teamMember.findMany({
      where: { teamId: teams[0]!.id },
    });
    expect(members).toHaveLength(3);
  });
});
