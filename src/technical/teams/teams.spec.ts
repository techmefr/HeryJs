import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';

interface TeamPayload {
  data: { id: string; name: string }[];
  meta: { currentTeamId: string | null };
}

describe('Teams', () => {
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

  const createTeam = async (user: TestUser, name: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name })
      .expect(201);

    return (response.body as { data: { id: string } }).data.id;
  };

  const listTeams = async (user: TestUser): Promise<TeamPayload> => {
    const response = await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    return response.body as TeamPayload;
  };

  it('refuses an unauthenticated caller', async () => {
    await request(app.getHttpServer()).get('/teams').expect(401);
  });

  it('reports no team for a caller who never joined one', async () => {
    const user = await registerAndLogin(app);
    const teams = await listTeams(user);

    expect(teams.data).toEqual([]);
    expect(teams.meta.currentTeamId).toBeNull();
  });

  it('puts the creator inside the team it just created', async () => {
    const user = await registerAndLogin(app);
    const teamId = await createTeam(user, 'Solo');
    const teams = await listTeams(user);

    expect(teams.data.map((team) => team.id)).toEqual([teamId]);
    expect(teams.meta.currentTeamId).toBe(teamId);
  });

  it('lets a member see a team it was added to', async () => {
    const owner = await registerAndLogin(app);
    const invited = await registerAndLogin(app);
    const teamId = await createTeam(owner, 'Shared');

    await request(app.getHttpServer())
      .post(`/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: invited.id })
      .expect(201);

    const teams = await listTeams(invited);
    expect(teams.data.map((team) => team.id)).toEqual([teamId]);
  });

  it('refuses an outsider adding itself to a team', async () => {
    const owner = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    const teamId = await createTeam(owner, 'Closed');

    await request(app.getHttpServer())
      .post(`/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ userId: outsider.id })
      .expect(403);

    expect((await listTeams(outsider)).data).toEqual([]);
  });

  it('refuses an outsider making a team its own current one', async () => {
    const owner = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    const teamId = await createTeam(owner, 'Private');

    await request(app.getHttpServer())
      .patch('/teams/current')
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ teamId })
      .expect(403);
  });

  it('switches the current team between two of its own', async () => {
    const user = await registerAndLogin(app);
    const first = await createTeam(user, 'First');
    const second = await createTeam(user, 'Second');

    expect((await listTeams(user)).meta.currentTeamId).toBe(first);

    await request(app.getHttpServer())
      .patch('/teams/current')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ teamId: second })
      .expect(200);

    expect((await listTeams(user)).meta.currentTeamId).toBe(second);
  });

  it('stops honouring a current team the caller was removed from', async () => {
    const user = await registerAndLogin(app);
    const kept = await createTeam(user, 'Kept');
    const dropped = await createTeam(user, 'Dropped');

    await request(app.getHttpServer())
      .patch('/teams/current')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ teamId: dropped })
      .expect(200);

    await authPrismaClient.teamMember.delete({
      where: { teamId_userId: { teamId: dropped, userId: user.id } },
    });

    // The stored value still points at the dropped team, so the session has to
    // refuse it rather than keep granting that perimeter.
    expect((await listTeams(user)).meta.currentTeamId).toBe(kept);
  });
});
