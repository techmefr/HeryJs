import {
  resolveRelationInstructions,
  type PrismaRelationClient,
} from './relation-resolver';
import type { RelationInstruction } from './list-query';

function delegateWith(overrides: {
  findMany?: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>[]>;
  groupBy?: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>[]>;
}): PrismaRelationClient {
  return {
    workoutNote: {
      findMany: overrides.findMany ?? (() => Promise.resolve([])),
      groupBy: overrides.groupBy ?? (() => Promise.resolve([])),
    },
  };
}

describe('resolveRelationInstructions', () => {
  it('normalizes a native _count into _aggregates and drops _count, even with no instructions', async () => {
    const records = [{ id: '1', _count: { notes: 3 } }];

    await resolveRelationInstructions(delegateWith({}), records, undefined);

    expect(records[0]).toEqual({ id: '1', _aggregates: { notes: 3 } });
  });

  it('resolves an include instruction by grouping child rows back onto their parent', async () => {
    const records: Record<string, unknown>[] = [{ id: 'a' }, { id: 'b' }];
    const findMany = jest.fn(() =>
      Promise.resolve([
        { id: 'n1', workoutId: 'a', body: 'first' },
        { id: 'n2', workoutId: 'a', body: 'second' },
        { id: 'n3', workoutId: 'b', body: 'third' },
      ]),
    );
    const instructions: RelationInstruction[] = [
      {
        kind: 'include',
        relation: 'notes',
        relationType: 'hasMany',
        foreignKey: 'workoutId',
        childDelegate: 'workoutNote',
      },
    ];

    await resolveRelationInstructions(
      delegateWith({ findMany }),
      records,
      instructions,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { workoutId: { in: ['a', 'b'] } },
    });
    expect(records[0]!.notes).toEqual([
      { id: 'n1', workoutId: 'a', body: 'first' },
      { id: 'n2', workoutId: 'a', body: 'second' },
    ]);
    expect(records[1]!.notes).toEqual([
      { id: 'n3', workoutId: 'b', body: 'third' },
    ]);
  });

  it('defaults a parent with no matching child rows to an empty include array', async () => {
    const records: Record<string, unknown>[] = [{ id: 'a' }];
    const instructions: RelationInstruction[] = [
      {
        kind: 'include',
        relation: 'notes',
        relationType: 'hasMany',
        foreignKey: 'workoutId',
        childDelegate: 'workoutNote',
      },
    ];

    await resolveRelationInstructions(delegateWith({}), records, instructions);

    expect(records[0]!.notes).toEqual([]);
  });

  it('scopes a morphMany include to its discriminator column and value', async () => {
    const records: Record<string, unknown>[] = [{ id: 'a' }];
    const findMany = jest.fn(() => Promise.resolve([]));
    const instructions: RelationInstruction[] = [
      {
        kind: 'include',
        relation: 'comments',
        relationType: 'morphMany',
        foreignKey: 'commentableId',
        discriminator: 'commentableType',
        discriminatorValue: 'Workout',
        childDelegate: 'workoutNote',
      },
    ];

    await resolveRelationInstructions(
      delegateWith({ findMany }),
      records,
      instructions,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        commentableId: { in: ['a'] },
        commentableType: 'Workout',
      },
    });
  });

  it('resolves a count-like aggregate via groupBy and writes the count into _aggregates', async () => {
    const records: Record<string, unknown>[] = [{ id: 'a' }, { id: 'b' }];
    const groupBy = jest.fn(() =>
      Promise.resolve([{ workoutId: 'a', _count: { _all: 2 } }]),
    );
    const instructions: RelationInstruction[] = [
      {
        kind: 'aggregate',
        relation: 'notes',
        aggregateKey: 'notes:count',
        aggregateType: 'count',
        relationType: 'hasMany',
        foreignKey: 'workoutId',
        childDelegate: 'workoutNote',
      },
    ];

    await resolveRelationInstructions(
      delegateWith({ groupBy }),
      records,
      instructions,
    );

    expect(groupBy).toHaveBeenCalledWith({
      by: ['workoutId'],
      where: { workoutId: { in: ['a', 'b'] } },
      _count: { _all: true },
    });
    expect(records[0]!._aggregates).toEqual({ 'notes:count': 2 });
    expect(records[1]!._aggregates).toEqual({ 'notes:count': 0 });
  });

  it('resolves an avg aggregate via groupBy, defaulting a parent with no rows to null', async () => {
    const records: Record<string, unknown>[] = [{ id: 'a' }, { id: 'b' }];
    const groupBy = jest.fn(() =>
      Promise.resolve([{ workoutId: 'a', _avg: { likes: 4.5 } }]),
    );
    const instructions: RelationInstruction[] = [
      {
        kind: 'aggregate',
        relation: 'notes',
        aggregateKey: 'notes:avg',
        aggregateType: 'avg',
        field: 'likes',
        relationType: 'hasMany',
        foreignKey: 'workoutId',
        childDelegate: 'workoutNote',
      },
    ];

    await resolveRelationInstructions(
      delegateWith({ groupBy }),
      records,
      instructions,
    );

    expect(groupBy).toHaveBeenCalledWith({
      by: ['workoutId'],
      where: { workoutId: { in: ['a', 'b'] } },
      _avg: { likes: true },
    });
    expect(records[0]!._aggregates).toEqual({ 'notes:avg': 4.5 });
    expect(records[1]!._aggregates).toEqual({ 'notes:avg': null });
  });

  it('throws when an instruction names a delegate the Prisma client does not have', async () => {
    const instructions: RelationInstruction[] = [
      {
        kind: 'aggregate',
        relation: 'notes',
        aggregateKey: 'notes:count',
        aggregateType: 'count',
        relationType: 'hasMany',
        foreignKey: 'workoutId',
        childDelegate: 'doesNotExist',
      },
    ];

    await expect(
      resolveRelationInstructions(
        delegateWith({}),
        [{ id: 'a' }],
        instructions,
      ),
    ).rejects.toThrow('doesNotExist');
  });
});
