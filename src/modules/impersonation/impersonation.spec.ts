import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import type { TestUser } from '#devtools/testing/register-and-login';
import { BlogPostModule } from '../../../examples/blog-post/blog-post.module';
import { ImpersonationExpiryTask } from './impersonation-expiry.task';
import { ImpersonationService } from './impersonation.service';

describe('Impersonation', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, BlogPostModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const promoteToAdmin = (userId: string) =>
    authPrismaClient.user.update({
      where: { id: userId },
      data: { role: 'admin' },
    });

  const startImpersonating = (admin: TestUser, targetId: string) =>
    request(app.getHttpServer())
      .post(`/impersonation/${targetId}`)
      .set('Authorization', `Bearer ${admin.token}`);

  it('refuses an unauthenticated caller on both routes', async () => {
    await request(app.getHttpServer())
      .post(`/impersonation/${randomUUID()}`)
      .expect(401);
    await request(app.getHttpServer()).delete('/impersonation').expect(401);
  });

  it('refuses a caller who is not an admin', async () => {
    const caller = await registerAndLogin(app);
    const target = await registerAndLogin(app);

    await startImpersonating(caller, target.id).expect(403);
  });

  it('refuses impersonating yourself, even as an admin', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    await startImpersonating(admin, admin.id).expect(400);
  });

  it('refuses an admin impersonating another admin', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    const otherAdmin = await registerAndLogin(app);
    await promoteToAdmin(otherAdmin.id);

    await startImpersonating(admin, otherAdmin.id).expect(403);
  });

  it('refuses impersonating a user in another tenant', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    const outsider = await authPrismaClient.user.create({
      data: {
        id: randomUUID(),
        email: `${randomUUID()}@example.test`,
        tenantId: `other-tenant-${randomUUID()}`,
      },
    });

    await startImpersonating(admin, outsider.id).expect(404);
  });

  it('lets an admin act as the target user, then hands the admin session back unharmed', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    const target = await registerAndLogin(app);
    const ownTeam = await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${target.token}`)
      .send({ name: 'Only the target belongs here' })
      .expect(201);
    const targetTeamId = (ownTeam.body as { data: { id: string } }).data.id;

    const started = await startImpersonating(admin, target.id).expect(201);
    const { data } = started.body as {
      data: { token: string; user: { id: string; email: string } };
    };
    expect(data.user.id).toBe(target.id);

    // Proof this is really the target's identity and not the admin's: only
    // the target ever joined this team, so seeing it back means the request
    // was authenticated as the target, not as whoever started the session.
    const seenAsTarget = await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${data.token}`)
      .expect(200);
    const seenTeamIds = (
      seenAsTarget.body as { data: { id: string }[] }
    ).data.map((team) => team.id);
    expect(seenTeamIds).toContain(targetTeamId);

    await request(app.getHttpServer())
      .delete('/impersonation')
      .set('Authorization', `Bearer ${data.token}`)
      .expect(200);

    // The token this endpoint minted is gone; the admin's own token, which
    // starting an impersonation never touched, still works.
    await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${data.token}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const trail = await authPrismaClient.auditLog.findMany({
      where: { model: 'Impersonation', recordId: target.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(trail.map((entry) => entry.operation)).toEqual(['start', 'end']);
    expect(trail.map((entry) => entry.userId)).toEqual([admin.id, target.id]);
    expect(trail.map((entry) => entry.impersonatedBy)).toEqual([
      null,
      admin.id,
    ]);
  });

  it('attributes a write made while impersonating to the target, but keeps the admin visible as impersonatedBy', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);
    const target = await registerAndLogin(app);

    const started = await startImpersonating(admin, target.id).expect(201);
    const { data } = started.body as { data: { token: string } };

    const created = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${data.token}`)
      .send({ data: [{ title: 'title-value' }] })
      .expect(201);
    const blogPostId = (
      created.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;

    const entry = await authPrismaClient.auditLog.findFirst({
      where: { model: 'BlogPost', recordId: blogPostId },
    });
    expect(entry?.userId).toBe(target.id);
    expect(entry?.impersonatedBy).toBe(admin.id);
  });

  it('carries the real human forward through a nested impersonation instead of the intermediate identity', async () => {
    // The HTTP route can never actually reach this: canImpersonate requires
    // the caller's role to be 'admin', and starting an impersonation refuses
    // an admin target outright, so a caller authenticated as someone already
    // being impersonated never has role 'admin'. That guard is a property of
    // the route, not of ImpersonationService.start() itself -- calling the
    // service directly is what actually exercises the fixed line.
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);
    const target = await registerAndLogin(app);

    const impersonationService = app.get(ImpersonationService);
    const originalAdminId = randomUUID();

    await impersonationService.start(
      {
        id: admin.id,
        email: admin.email,
        tenantId: 'default',
        teamIds: [],
        currentTeamId: null,
        role: 'admin',
        impersonatedBy: originalAdminId,
      },
      admin.token,
      target.id,
    );

    const entry = await authPrismaClient.auditLog.findFirst({
      where: {
        model: 'Impersonation',
        operation: 'start',
        recordId: target.id,
      },
    });
    expect(entry?.impersonatedBy).toBe(originalAdminId);
  });

  it('refuses to end a session that never started one', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);

    await request(app.getHttpServer())
      .delete('/impersonation')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(400);
  });

  it('revokes an impersonation session past its expiry and audits it like an explicit stop', async () => {
    const admin = await registerAndLogin(app);
    await promoteToAdmin(admin.id);
    const target = await registerAndLogin(app);

    const started = await startImpersonating(admin, target.id).expect(201);
    const { data } = started.body as { data: { token: string } };

    await authPrismaClient.session.update({
      where: { token: data.token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expiryTask = app.get(ImpersonationExpiryTask);
    await expiryTask.run();

    const session = await authPrismaClient.session.findUnique({
      where: { token: data.token },
    });
    expect(session).toBeNull();

    await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${data.token}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/teams')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const trail = await authPrismaClient.auditLog.findMany({
      where: { model: 'Impersonation', recordId: target.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(trail.map((entry) => entry.operation)).toEqual(['start', 'expire']);
    expect(trail.map((entry) => entry.impersonatedBy)).toEqual([
      null,
      admin.id,
    ]);
  });
});
