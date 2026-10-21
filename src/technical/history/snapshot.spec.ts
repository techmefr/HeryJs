import { diffSnapshots, revertPatchOf, snapshotOf } from './snapshot';

describe('snapshot', () => {
  it('keeps only the registered columns, as JSON', () => {
    const snapshot = snapshotOf('Snippet', {
      id: 'a',
      title: 'hello',
      ownerId: 'u',
      version: 2,
      deletedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(snapshot).toEqual({
      title: 'hello',
      version: 2,
      deletedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('is null for a model with no history', () => {
    expect(snapshotOf('User', { id: 'a' })).toBeNull();
  });

  it('diffs only what changed', () => {
    expect(diffSnapshots({ a: 1, b: 'x' }, { a: 1, b: 'y', c: true })).toEqual([
      { field: 'b', before: 'x', after: 'y' },
      { field: 'c', before: null, after: true },
    ]);
  });

  it('reverts only revertible fields the snapshot holds', () => {
    expect(
      revertPatchOf({ title: 't', version: 3 }, ['title', 'other']),
    ).toEqual({ title: 't' });
  });
});
