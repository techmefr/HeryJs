import { runInTenant } from '#technical/tenancy/run-in-tenant';
import { modelChangeMessages, outboxEmitsFor } from './outbox-stage';

const ACTOR = { userId: 'user-1', impersonatedBy: 'admin-1' };

function messagesFor(
  operation: string,
  args: unknown,
  result: unknown,
  model = 'BlogPost',
) {
  return runInTenant(
    'tenant-1',
    () =>
      Promise.resolve(
        modelChangeMessages({
          model,
          operation,
          args,
          result,
          tenantId: 'tenant-1',
        }),
      ),
    ACTOR,
  );
}

describe('outboxEmitsFor', () => {
  it('announces the single-row writes and the bulk ones that return rows', () => {
    for (const operation of [
      'create',
      'update',
      'upsert',
      'delete',
      'createManyAndReturn',
      'updateManyAndReturn',
    ]) {
      expect(outboxEmitsFor('BlogPost', operation)).toBe(true);
    }
  });

  it('stays quiet for reads and for bulk writes that only report a count', () => {
    for (const operation of [
      'findMany',
      'count',
      'createMany',
      'updateMany',
      'deleteMany',
    ]) {
      expect(outboxEmitsFor('BlogPost', operation)).toBe(false);
    }
  });

  it('never announces a notification row, which is itself a side effect', () => {
    expect(outboxEmitsFor('AppNotification', 'create')).toBe(false);
  });
});

describe('modelChangeMessages', () => {
  it('describes a create with the row id, the tenant and who did it', async () => {
    const [message] = await messagesFor(
      'create',
      { data: { title: 'hello' } },
      { id: 'post-1' },
    );

    expect(message).toEqual({
      name: 'model.created',
      tenantId: 'tenant-1',
      payload: {
        model: 'BlogPost',
        kind: 'created',
        recordId: 'post-1',
        tenantId: 'tenant-1',
        changedFields: [],
        ownerId: null,
        teamId: null,
        userId: 'user-1',
        impersonatedBy: 'admin-1',
      },
    });
  });

  it('carries the owner and team ids a subscriber is filtered by, and no other value', async () => {
    const [message] = await messagesFor(
      'create',
      { data: { title: 'hello' } },
      { id: 'post-1', ownerId: 'owner-1', teamId: 'team-1', title: 'hello' },
    );

    expect(message?.payload).toMatchObject({
      ownerId: 'owner-1',
      teamId: 'team-1',
    });
    expect(JSON.stringify(message?.payload)).not.toContain('hello');
  });

  it('lists the fields an update touched, never their values', async () => {
    const [message] = await messagesFor(
      'update',
      { where: { id: 'post-1' }, data: { title: 'secret' } },
      { id: 'post-1' },
    );

    expect(message?.name).toBe('model.updated');
    expect(message?.payload.changedFields).toEqual(['title']);
    expect(JSON.stringify(message?.payload)).not.toContain('secret');
  });

  it('reads an upsert through its update branch', async () => {
    const [message] = await messagesFor(
      'upsert',
      { where: {}, create: { title: 'a' }, update: { title: 'b' } },
      { id: 'post-1' },
    );

    expect(message?.name).toBe('model.updated');
    expect(message?.payload.changedFields).toEqual(['title']);
  });

  it('reports a soft delete as a deletion rather than an update', async () => {
    const [stamped] = await messagesFor(
      'update',
      { where: { id: 'post-1' }, data: { deletedAt: new Date() } },
      { id: 'post-1' },
    );
    const [wrapped] = await messagesFor(
      'update',
      { where: { id: 'post-1' }, data: { deletedAt: { set: new Date() } } },
      { id: 'post-1' },
    );

    expect(stamped?.name).toBe('model.deleted');
    expect(wrapped?.name).toBe('model.deleted');
  });

  it('reports a restore as an update', async () => {
    const [message] = await messagesFor(
      'update',
      { where: { id: 'post-1' }, data: { deletedAt: null } },
      { id: 'post-1' },
    );

    expect(message?.name).toBe('model.updated');
  });

  it('reports a hard delete', async () => {
    const [message] = await messagesFor(
      'delete',
      { where: { id: 'post-1' } },
      { id: 'post-1' },
    );

    expect(message?.name).toBe('model.deleted');
    expect(message?.payload.changedFields).toEqual([]);
  });

  it('writes one message per row a bulk operation returns', async () => {
    const messages = await messagesFor(
      'createManyAndReturn',
      { data: [{ title: 'a' }, { title: 'b' }] },
      [{ id: 'a' }, { id: 'b' }],
    );

    expect(messages.map((message) => message.payload.recordId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('records no row id when the caller selected it away', async () => {
    const [message] = await messagesFor(
      'create',
      { data: {}, select: { title: true } },
      { title: 'x' },
    );

    expect(message?.payload.recordId).toBeNull();
  });
});
