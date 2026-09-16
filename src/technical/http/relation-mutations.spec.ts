import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { applyRelationMutation } from './relation-mutations';
import type { PivotDelegate, RelatedDelegate } from './relation-mutations';

interface PivotRow {
  blogPostId: string;
  tagId: string;
}

/**
 * Stands in for the tenant-scoped client: `visible` is what this tenant can
 * see, and anything else simply does not come back -- which is exactly how the
 * real delegate behaves once the extension has filtered it.
 */
function fakeRelated(visible: string[]): RelatedDelegate {
  return {
    findMany: (args) => {
      const where = args.where as { id: { in: string[] } };

      return Promise.resolve(
        where.id.in.filter((id) => visible.includes(id)).map((id) => ({ id })),
      );
    },
  };
}

function fakePivot(rows: PivotRow[]) {
  const calls: string[] = [];
  const delegate: PivotDelegate = {
    createMany: (args) => {
      calls.push('createMany');
      const data = args.data as PivotRow[];
      rows.push(...data);
      return Promise.resolve(undefined);
    },
    deleteMany: (args) => {
      calls.push('deleteMany');
      const where = args.where as {
        tagId?: { in?: string[]; notIn?: string[] };
      };

      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];

        if (!row) {
          continue;
        }

        const inList = where.tagId?.in;
        const notInList = where.tagId?.notIn;
        const matches = inList
          ? inList.includes(row.tagId)
          : !notInList?.includes(row.tagId);

        if (matches) {
          rows.splice(index, 1);
        }
      }

      return Promise.resolve(undefined);
    },
    findMany: () => Promise.resolve(rows.map((row) => ({ tagId: row.tagId }))),
  };

  return { delegate, rows, calls };
}

function mutate(
  pivot: PivotDelegate,
  related: RelatedDelegate,
  input: Parameters<typeof applyRelationMutation>[6],
) {
  return applyRelationMutation(
    pivot,
    related,
    'tags',
    'blogPostId',
    'tagId',
    'post-1',
    input,
  );
}

describe('applyRelationMutation', () => {
  it('attaches ids the caller can see', async () => {
    const pivot = fakePivot([]);

    const result = await mutate(pivot.delegate, fakeRelated(['tag-1']), {
      attach: ['tag-1'],
    });

    expect(result).toEqual(['tag-1']);
  });

  /**
   * The critical one. A pivot row carries its own tenantId, stamped correctly,
   * so nothing downstream looked wrong -- but its relatedKey pointed at
   * another tenant's row, and including the relation read that row straight
   * back. Attaching has to refuse an id this tenant cannot see.
   */
  it('refuses to attach an id belonging to another tenant, and writes nothing', async () => {
    const pivot = fakePivot([]);

    await expect(
      mutate(pivot.delegate, fakeRelated(['tag-1']), {
        attach: ['tag-1', 'other-tenant-tag'],
      }),
    ).rejects.toBeInstanceOf(InvalidQueryException);

    expect(pivot.calls).not.toContain('createMany');
    expect(pivot.rows).toEqual([]);
  });

  it('refuses a sync carrying a foreign id before detaching anything', async () => {
    const pivot = fakePivot([{ blogPostId: 'post-1', tagId: 'tag-1' }]);

    await expect(
      mutate(pivot.delegate, fakeRelated(['tag-1']), {
        sync: ['other-tenant-tag'],
      }),
    ).rejects.toBeInstanceOf(InvalidQueryException);

    // The refusal lands before the deleteMany, so a rejected sync cannot
    // strip the links the caller already had.
    expect(pivot.calls).toEqual([]);
    expect(pivot.rows).toEqual([{ blogPostId: 'post-1', tagId: 'tag-1' }]);
  });

  it('names the unknown ids without confirming they exist elsewhere', async () => {
    await expect(
      mutate(fakePivot([]).delegate, fakeRelated([]), {
        attach: ['ghost'],
      }),
    ).rejects.toThrow(/ghost/);
  });

  // Detaching can only ever remove a link the caller's own parent owns, so an
  // id it cannot see matches nothing and needs no lookup of its own.
  it('detaches without checking visibility', async () => {
    const pivot = fakePivot([{ blogPostId: 'post-1', tagId: 'tag-1' }]);

    const result = await mutate(pivot.delegate, fakeRelated([]), {
      detach: ['tag-1'],
    });

    expect(result).toEqual([]);
  });

  it('syncs to exactly the listed ids', async () => {
    const pivot = fakePivot([{ blogPostId: 'post-1', tagId: 'tag-1' }]);

    const result = await mutate(pivot.delegate, fakeRelated(['tag-2']), {
      sync: ['tag-2'],
    });

    expect(result).toEqual(['tag-2']);
  });

  it('checks a repeated id once rather than per occurrence', async () => {
    const seen: string[][] = [];
    const related: RelatedDelegate = {
      findMany: (args) => {
        const where = args.where as { id: { in: string[] } };
        seen.push(where.id.in);
        return Promise.resolve(where.id.in.map((id) => ({ id })));
      },
    };

    await mutate(fakePivot([]).delegate, related, {
      attach: ['tag-1', 'tag-1'],
    });

    expect(seen).toEqual([['tag-1']]);
  });
});
