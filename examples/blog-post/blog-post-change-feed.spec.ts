import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { BlogPostModule } from './blog-post.module';
import { AUTH_PROVIDER } from '@heryjs/core/auth';
import type { AuthProvider } from '@heryjs/core/auth';
import { subscriberOf } from '@heryjs/core/realtime';
import { ChangeFeedHub } from '@heryjs/core/realtime';
import type { ChangeFeedSession } from '@heryjs/core/realtime';
import type { ChangeFeedMessage } from '@heryjs/core/realtime';
import { OutboxRelay } from '@heryjs/core/jobs';
import { registerAndLogin } from '#devtools/testing/register-and-login';
import { waitFor } from '#devtools/testing/wait-for';

const DELIVERY_TIMEOUT_MS = 3000;
const POLL_MS = 25;

async function until(condition: () => boolean): Promise<void> {
  await waitFor(condition, {
    timeoutMs: DELIVERY_TIMEOUT_MS,
    intervalMs: POLL_MS,
    description: 'the change feed delivery',
  });
}

describe('BlogPost change feed (real database, real outbox, real redis)', () => {
  let app: INestApplication<App>;
  let relay: OutboxRelay;
  let ownerToken: string;
  let strangerToken: string;
  const sessions: ChangeFeedSession[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, BlogPostModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    relay = moduleRef.get(OutboxRelay, { strict: false });

    ownerToken = (await registerAndLogin(app)).token;
    strangerToken = (await registerAndLogin(app)).token;
  });

  afterAll(async () => {
    await Promise.all(sessions.map((session) => session.close()));
    await app.close();
  });

  async function listen(token: string) {
    const authProvider = app.get<AuthProvider>(AUTH_PROVIDER);
    const user = await authProvider.validateSession(token);
    const received: ChangeFeedMessage[] = [];
    const session = app
      .get(ChangeFeedHub)
      .open(subscriberOf(user!), (message) => received.push(message));
    sessions.push(session);
    await session.subscribe(['blogPost']);

    return received;
  }

  async function createPost(token: string, title: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/blog-posts/create')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: [{ title }] })
      .expect(201);

    return (
      response.body as { data: { status: string; data: { id: string } }[] }
    ).data[0]!.data.id;
  }

  it('delivers a created row to its owner and not to another user of the same tenant', async () => {
    const owner = await listen(ownerToken);
    const stranger = await listen(strangerToken);

    const id = await createPost(ownerToken, 'feed-created');
    await relay.drain();
    await until(() => owner.some((message) => message.type === 'change'));

    const change = owner.find(
      (message) => message.type === 'change' && message.recordId === id,
    );

    expect(change).toMatchObject({
      type: 'change',
      channel: 'blogPost',
      kind: 'created',
      record: { id, title: 'feed-created' },
    });
    expect(
      stranger.filter(
        (message) => message.type === 'change' && message.recordId === id,
      ),
    ).toEqual([]);
  });

  it('delivers an update with the fields it touched and a deletion as a tombstone, owner only', async () => {
    const id = await createPost(ownerToken, 'feed-before');
    await relay.drain();
    const owner = await listen(ownerToken);
    const stranger = await listen(strangerToken);

    await request(app.getHttpServer())
      .post('/blog-posts/update')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ data: [{ id, title: 'feed-after' }] })
      .expect(201);
    await relay.drain();
    await until(() => owner.length >= 1);
    await request(app.getHttpServer())
      .post('/blog-posts/delete')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [id] })
      .expect(201);
    await relay.drain();
    await until(() => owner.length >= 2);

    const mine = owner.filter(
      (message) => message.type === 'change' && message.recordId === id,
    );

    expect(
      mine.map((message) => message.type === 'change' && message.kind),
    ).toEqual(['updated', 'deleted']);
    expect(mine[0]).toMatchObject({
      changedFields: ['title', 'slug'],
      record: { title: 'feed-after' },
    });
    expect(mine[1]).toMatchObject({ record: null });
    expect(
      stranger.filter(
        (message) => message.type === 'change' && message.recordId === id,
      ),
    ).toEqual([]);
  });

  it('carries only what the resource view exposes', async () => {
    const owner = await listen(ownerToken);

    const id = await createPost(ownerToken, 'feed-view');
    await relay.drain();
    await until(() => owner.length >= 1);

    const change = owner.find(
      (message) => message.type === 'change' && message.recordId === id,
    );

    expect(
      Object.keys(
        change?.type === 'change' ? (change.record ?? {}) : {},
      ).sort(),
    ).toEqual([
      'body',
      'createdAt',
      'deletedAt',
      'id',
      'ownerId',
      'slug',
      'summary',
      'summaryTranslations',
      'tenantId',
      'title',
      'updatedAt',
    ]);
  });
});
