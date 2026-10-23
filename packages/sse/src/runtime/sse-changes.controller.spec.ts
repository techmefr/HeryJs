import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { ChangeFeedHub, ChangeFeedTokenService } from '@heryjs/core/realtime';
import {
  ChangeFeedRegistry,
  type ChangeFeedSubscriber,
  InMemoryChangeFeedBackend,
} from '@heryjs/core/testing';
import {
  CapabilityForbiddenException,
  InvalidSessionException,
} from '@heryjs/core/errors';
import { SseChangesController } from './sse-changes.controller';

function fakeResponse() {
  const req = new EventEmitter() as unknown as Request;
  const chunks: string[] = [];
  const res = {
    req,
    writeHead: () => res,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    status: () => res,
    end: () => undefined,
  } as unknown as Response;

  return { res, req, chunks };
}

function fakeRequest(lastEventId?: string): Request {
  return {
    query: {},
    header: (name: string) =>
      name.toLowerCase() === 'last-event-id' ? lastEventId : undefined,
  } as unknown as Request;
}

function subscriber(id: string, tenantId = 'tenant-1'): ChangeFeedSubscriber {
  return {
    tenantId,
    userId: id,
    subject: { id, teamIds: [], currentTeamId: null, role: null },
  };
}

describe('SseChangesController', () => {
  const tokens = new ChangeFeedTokenService();
  let backend: InMemoryChangeFeedBackend;
  let controller: SseChangesController;

  beforeEach(() => {
    backend = new InMemoryChangeFeedBackend();
    const registry = new ChangeFeedRegistry();
    registry.register<{ ownerId: string }>({
      model: 'Post',
      channel: 'posts',
      canViewAny: () => ({ allowed: true, scope: 'own' }),
      canView: (subject, record) => ({
        allowed:
          record !== undefined &&
          'ownerId' in record &&
          record.ownerId === subject.id,
      }),
      load: () => Promise.resolve(null),
      toView: () => ({}),
    });
    registry.register<{ ownerId: string }>({
      model: 'Secret',
      channel: 'secrets',
      canViewAny: () => ({ allowed: false }),
      canView: () => ({ allowed: false }),
      load: () => Promise.resolve(null),
      toView: () => ({}),
    });
    controller = new SseChangesController(
      tokens,
      new ChangeFeedHub(registry, backend),
    );
  });

  function publishPost(ownerId: string, id = 'message-1') {
    return backend.publish({
      type: 'change',
      id,
      tenantId: 'tenant-1',
      channel: 'posts',
      model: 'Post',
      kind: 'created',
      recordId: 'post-1',
      at: '2026-10-21T10:00:00.000Z',
      changedFields: [],
      record: { id: 'post-1', title: 'hello' },
      visibility: { ownerId },
    });
  }

  it('mints a token that carries the caller, not just the tenant', () => {
    const result = controller.issueToken({
      user: {
        id: 'alice',
        email: 'a@example.test',
        tenantId: 'tenant-1',
        teamIds: ['team-1'],
        currentTeamId: 'team-1',
        role: null,
        impersonatedBy: null,
      },
    } as never);

    expect(tokens.verify(result.data.token)).toMatchObject({
      tenantId: 'tenant-1',
      userId: 'alice',
      subject: { id: 'alice', teamIds: ['team-1'] },
    });
  });

  it('streams a row to the owner as a change event with an id, and none to anyone else', async () => {
    const alice = fakeResponse();
    const bob = fakeResponse();
    await controller.stream(
      fakeRequest(),
      tokens.issue(subscriber('alice')),
      'posts',
      alice.res,
    );
    await controller.stream(
      fakeRequest(),
      tokens.issue(subscriber('bob')),
      'posts',
      bob.res,
    );

    await publishPost('alice');

    const aliceFrames = alice.chunks.join('');
    expect(aliceFrames).toContain('event: subscribed');
    expect(aliceFrames).toContain('id: message-1\nevent: change');
    expect(aliceFrames).toContain('"title":"hello"');
    expect(bob.chunks.join('')).not.toContain('event: change');

    alice.req.emit('close');
    bob.req.emit('close');
  });

  it('refuses a missing, forged or expired token', async () => {
    const { res } = fakeResponse();

    for (const token of [
      undefined,
      'junk.junk',
      tokens.issue(subscriber('a'), -1),
    ]) {
      await expect(
        controller.stream(fakeRequest(), token, 'posts', res),
      ).rejects.toBeInstanceOf(InvalidSessionException);
    }
  });

  it('answers 400 when no channel is asked for', async () => {
    const { res } = fakeResponse();
    let status = 0;
    (res as unknown as { status: (code: number) => Response }).status = (
      code,
    ) => {
      status = code;
      return res;
    };

    await controller.stream(
      fakeRequest(),
      tokens.issue(subscriber('a')),
      ' , ',
      res,
    );

    expect(status).toBe(400);
  });

  it('refuses with 403 when every channel asked for is out of reach', async () => {
    const { res } = fakeResponse();

    await expect(
      controller.stream(
        fakeRequest(),
        tokens.issue(subscriber('a')),
        'secrets,missing',
        res,
      ),
    ).rejects.toBeInstanceOf(CapabilityForbiddenException);
    expect(backend.listenerCount('tenant-1')).toBe(0);
  });

  it('streams the channels it may and names the ones it refused', async () => {
    const { res, req, chunks } = fakeResponse();

    await controller.stream(
      fakeRequest(),
      tokens.issue(subscriber('alice')),
      'posts,secrets',
      res,
    );

    expect(chunks.join('')).toContain(
      '"denied":[{"channel":"secrets","reason":"forbidden"}]',
    );
    req.emit('close');
  });

  it('tells a reconnecting browser to resync instead of pretending to replay', async () => {
    const { res, req, chunks } = fakeResponse();

    await controller.stream(
      fakeRequest('message-0'),
      tokens.issue(subscriber('alice')),
      'posts',
      res,
    );

    expect(chunks.join('')).toContain('event: resync');
    req.emit('close');
  });

  it('releases the backend subscription when the client goes away', async () => {
    const { res, req } = fakeResponse();
    await controller.stream(
      fakeRequest(),
      tokens.issue(subscriber('alice')),
      'posts',
      res,
    );
    expect(backend.listenerCount('tenant-1')).toBe(1);

    req.emit('close');
    await new Promise((resolve) => setImmediate(resolve));

    expect(backend.listenerCount('tenant-1')).toBe(0);
  });

  it('holds back a change that arrives while the subscription is still being set up', async () => {
    const { res, req, chunks } = fakeResponse();
    const original = backend.subscribe.bind(backend);
    backend.subscribe = async (tenantId, listener) => {
      const stop = await original(tenantId, listener);
      await publishPost('alice', 'early');
      return stop;
    };

    await controller.stream(
      fakeRequest(),
      tokens.issue(subscriber('alice')),
      'posts',
      res,
    );

    const output = chunks.join('');
    expect(output.indexOf(': connected')).toBeLessThan(
      output.indexOf('id: early'),
    );
    req.emit('close');
  });
});
