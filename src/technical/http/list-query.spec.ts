import {
  InvalidQueryException,
  PaginationNotOfferedException,
} from '#technical/errors/invalid-query.exception';
import {
  nextCursorFor,
  parseSearchRequest,
  withIncludesAndAggregates,
  type ListQueryContract,
} from './list-query';

const contract: ListQueryContract = {
  sorts: ['title', 'createdAt'],
  filters: ['title', 'reps'],
  selects: ['id', 'title', 'reps', 'createdAt'],
  limits: [10, 15, 20],
  defaultLimit: 15,
  includes: {
    notes: {
      type: 'hasMany',
      foreignKey: 'blogPostId',
      childDelegate: 'blogPostNote',
      filters: ['body'],
      sorts: ['createdAt'],
      selects: ['id', 'body'],
      includes: {
        replies: {
          type: 'hasMany',
          foreignKey: 'noteId',
          childDelegate: 'noteReply',
          filters: ['body'],
          sorts: ['createdAt'],
          selects: ['id', 'body'],
          includes: {
            reactions: {
              type: 'hasMany',
              foreignKey: 'replyId',
              childDelegate: 'reaction',
              filters: [],
              sorts: [],
              selects: ['id'],
            },
          },
        },
        flags: {
          type: 'morphMany',
          foreignKey: 'flaggableId',
          discriminator: 'flaggableType',
          discriminatorValue: 'BlogPostNote',
          childDelegate: 'flag',
          filters: [],
          sorts: [],
          selects: ['id'],
        },
      },
    },
    comments: {
      type: 'morphMany',
      foreignKey: 'commentableId',
      discriminator: 'commentableType',
      discriminatorValue: 'BlogPost',
      childDelegate: 'comment',
      filters: ['body'],
      sorts: ['createdAt'],
      selects: ['id', 'body'],
    },
  },
  aggregates: {
    notes: {
      type: 'hasMany',
      foreignKey: 'blogPostId',
      childDelegate: 'blogPostNote',
      filters: ['body'],
      fields: ['likes'],
    },
    comments: {
      type: 'morphMany',
      foreignKey: 'commentableId',
      discriminator: 'commentableType',
      discriminatorValue: 'BlogPost',
      childDelegate: 'comment',
      filters: ['body'],
      fields: ['likes'],
    },
  },
};

describe('parseSearchRequest', () => {
  it('applies the contract default limit when none is given', () => {
    const query = parseSearchRequest({}, contract);

    expect(query.limit).toBe(15);
  });

  it('rejects a limit outside the contract list', () => {
    expect(() => parseSearchRequest({ limit: 99 }, contract)).toThrow(
      InvalidQueryException,
    );
  });

  it('defaults page to 1', () => {
    const query = parseSearchRequest({}, contract);

    expect(query.page).toBe(1);
  });

  it('passes a given page through', () => {
    const query = parseSearchRequest({ page: 3 }, contract);

    expect(query.page).toBe(3);
  });

  it('defaults an unqualified sort direction to ascending', () => {
    const query = parseSearchRequest(
      { sorts: [{ field: 'title', direction: 'asc' }] },
      contract,
    );

    expect(query.sorts).toEqual([
      { field: 'title', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
  });

  it('preserves the order and direction of multiple sorts', () => {
    const query = parseSearchRequest(
      {
        sorts: [
          { field: 'createdAt', direction: 'desc' },
          { field: 'title', direction: 'asc' },
        ],
      },
      contract,
    );

    expect(query.sorts).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'title', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
  });

  it('rejects a sort field the contract does not list', () => {
    expect(() =>
      parseSearchRequest(
        { sorts: [{ field: 'secret', direction: 'asc' }] },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('rejects a filter field the contract does not list', () => {
    expect(() =>
      parseSearchRequest(
        { filters: [{ field: 'secret', value: 'x' }] },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('defaults a filter without an operator to equality', () => {
    const query = parseSearchRequest(
      { filters: [{ field: 'title', value: 'gym' }] },
      contract,
    );

    expect(query.where).toEqual({ title: { equals: 'gym' } });
  });

  it('builds the where fragment from the validated operator, never from the raw value', () => {
    const query = parseSearchRequest(
      { filters: [{ field: 'reps', operator: '>=', value: 10 }] },
      contract,
    );

    expect(query.where).toEqual({ reps: { gte: 10 } });
  });

  it('rejects in/not in without an array value', () => {
    expect(() =>
      parseSearchRequest(
        { filters: [{ field: 'reps', operator: 'in', value: 5 }] },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('accepts in with an array value', () => {
    const query = parseSearchRequest(
      { filters: [{ field: 'reps', operator: 'in', value: [5, 10] }] },
      contract,
    );

    expect(query.where).toEqual({ reps: { in: [5, 10] } });
  });

  it('an or-typed filter unites with the one before it, not a parallel branch', () => {
    const query = parseSearchRequest(
      {
        filters: [
          { field: 'title', value: 'gym' },
          { field: 'reps', operator: '>', value: 5, type: 'or' },
        ],
      },
      contract,
    );

    expect(query.where).toEqual({
      OR: [{ title: { equals: 'gym' } }, { reps: { gt: 5 } }],
    });
  });

  it('and-groups consecutive and-typed filters before an or splits the branch', () => {
    const query = parseSearchRequest(
      {
        filters: [
          { field: 'title', value: 'gym' },
          { field: 'reps', operator: '>=', value: 10 },
          { field: 'reps', operator: '<', value: 3, type: 'or' },
        ],
      },
      contract,
    );

    expect(query.where).toEqual({
      OR: [
        {
          AND: [{ title: { equals: 'gym' } }, { reps: { gte: 10 } }],
        },
        { reps: { lt: 3 } },
      ],
    });
  });

  it('evaluates a nested group as a single condition', () => {
    const query = parseSearchRequest(
      {
        filters: [
          {
            type: 'or',
            nested: [
              { field: 'title', value: 'gym' },
              { field: 'reps', operator: '>', value: 5, type: 'or' },
            ],
          },
        ],
      },
      contract,
    );

    expect(query.where).toEqual({
      OR: [{ title: { equals: 'gym' } }, { reps: { gt: 5 } }],
    });
  });

  it('rejects filter nesting past the bounded depth', () => {
    const deeplyNested = { field: 'title', value: 'gym' };
    const level3 = { nested: [deeplyNested] };
    const level2 = { nested: [level3] };
    const level1 = { nested: [level2] };

    expect(() => parseSearchRequest({ filters: [level1] }, contract)).toThrow(
      InvalidQueryException,
    );
  });

  it('rejects a select field the contract does not list', () => {
    expect(() =>
      parseSearchRequest({ selects: [{ field: 'secret' }] }, contract),
    ).toThrow(InvalidQueryException);
  });

  it('turns selects into a Prisma select map', () => {
    const query = parseSearchRequest(
      { selects: [{ field: 'id' }, { field: 'title' }] },
      contract,
    );

    expect(query.select).toEqual({ id: true, title: true });
  });

  it('coerces withTrashed and onlyTrashed to booleans', () => {
    const query = parseSearchRequest(
      { withTrashed: true, onlyTrashed: false },
      contract,
    );

    expect(query.withTrashed).toBe(true);
    expect(query.onlyTrashed).toBe(false);
  });

  it('defaults withTrashed and onlyTrashed to false when omitted', () => {
    const query = parseSearchRequest({}, contract);

    expect(query.withTrashed).toBe(false);
    expect(query.onlyTrashed).toBe(false);
  });

  it('rejects an include naming a relation the contract does not list', () => {
    expect(() =>
      parseSearchRequest({ includes: [{ relation: 'secret' }] }, contract),
    ).toThrow(InvalidQueryException);
  });

  it('builds a Prisma include clause scoped to the relation, filtered and sorted', () => {
    const query = parseSearchRequest(
      {
        includes: [
          {
            relation: 'notes',
            filters: [{ field: 'body', operator: 'like', value: 'day' }],
            sorts: [{ field: 'createdAt', direction: 'desc' }],
            limit: 5,
          },
        ],
      },
      contract,
    );

    expect(query.include).toEqual({
      notes: {
        where: { body: { contains: 'day' } },
        orderBy: [{ createdAt: 'desc' }],
        select: { id: true, body: true },
        take: 5,
      },
    });
    expect(query.includeManifest).toEqual([
      { key: 'notes', relation: 'notes' },
    ]);
  });

  it("bounds an include with no selects to the relation's declared fields", () => {
    const query = parseSearchRequest(
      { includes: [{ relation: 'notes' }] },
      contract,
    );

    expect(query.include).toEqual({
      notes: { select: { id: true, body: true } },
    });
  });

  it('bounds a morphMany include with no selects the same way', () => {
    const query = parseSearchRequest(
      { includes: [{ relation: 'comments' }] },
      contract,
    );

    expect(query.relationInstructions).toEqual([
      expect.objectContaining({
        relation: 'comments',
        select: { id: true, body: true },
      }),
    ]);
  });

  it('narrows an include to the fields the caller named', () => {
    const query = parseSearchRequest(
      { includes: [{ relation: 'notes', selects: [{ field: 'body' }] }] },
      contract,
    );

    expect(query.include).toEqual({ notes: { select: { body: true } } });
  });

  it('keys an included relation by its alias instead of the relation name', () => {
    const query = parseSearchRequest(
      { includes: [{ relation: 'notes', alias: 'recentNotes' }] },
      contract,
    );

    expect(query.includeManifest).toEqual([
      { key: 'recentNotes', relation: 'notes' },
    ]);
  });

  it('rejects an alias that collides with one of the resource own fields', () => {
    expect(() =>
      parseSearchRequest(
        { includes: [{ relation: 'notes', alias: 'title' }] },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('rejects two includes claiming the same alias', () => {
    expect(() =>
      parseSearchRequest(
        {
          includes: [
            { relation: 'notes', alias: 'sameKey' },
            { relation: 'notes', alias: 'sameKey' },
          ],
        },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('nests a hasMany include inside its parent as a native Prisma select', () => {
    const query = parseSearchRequest(
      {
        includes: [
          {
            relation: 'notes',
            includes: [
              {
                relation: 'replies',
                filters: [{ field: 'body', operator: 'like', value: 'hi' }],
              },
            ],
          },
        ],
      },
      contract,
    );

    expect(query.include).toEqual({
      notes: {
        select: {
          id: true,
          body: true,
          replies: {
            where: { body: { contains: 'hi' } },
            select: { id: true, body: true },
          },
        },
      },
    });
  });

  it('does not flatten a nested include into includeManifest -- only the top level gets one', () => {
    const query = parseSearchRequest(
      {
        includes: [{ relation: 'notes', includes: [{ relation: 'replies' }] }],
      },
      contract,
    );

    expect(query.includeManifest).toEqual([
      { key: 'notes', relation: 'notes' },
    ]);
  });

  it('rejects a nested include naming a relation the child contract does not list', () => {
    expect(() =>
      parseSearchRequest(
        {
          includes: [{ relation: 'notes', includes: [{ relation: 'secret' }] }],
        },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('rejects a third level of nesting past the depth cap', () => {
    expect(() =>
      parseSearchRequest(
        {
          includes: [
            {
              relation: 'notes',
              includes: [
                {
                  relation: 'replies',
                  includes: [{ relation: 'reactions' }],
                },
              ],
            },
          ],
        },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('rejects a morphMany relation nested past the top level', () => {
    expect(() =>
      parseSearchRequest(
        {
          includes: [{ relation: 'notes', includes: [{ relation: 'flags' }] }],
        },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('rejects an aggregate naming a relation the contract does not list', () => {
    expect(() =>
      parseSearchRequest(
        { aggregates: [{ relation: 'secret', type: 'count' }] },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('folds a count aggregate into a Prisma _count select, defaulting its key', () => {
    const query = parseSearchRequest(
      { aggregates: [{ relation: 'notes', type: 'count' }] },
      contract,
    );

    expect(query.include).toEqual({ _count: { select: { notes: true } } });
    expect(query.aggregateManifest).toEqual([
      {
        key: 'notes_count',
        relation: 'notes',
        type: 'count',
        bucketKey: 'notes',
      },
    ]);
  });

  it('scopes an aggregate to its own filter, validated against its own contract', () => {
    const query = parseSearchRequest(
      {
        aggregates: [
          {
            relation: 'notes',
            type: 'count',
            filters: [{ field: 'body', operator: 'like', value: 'leg' }],
          },
        ],
      },
      contract,
    );

    expect(query.include).toEqual({
      _count: { select: { notes: { where: { body: { contains: 'leg' } } } } },
    });
  });

  it('an aggregate and an include can share the same relation without colliding', () => {
    const query = parseSearchRequest(
      {
        includes: [{ relation: 'notes' }],
        aggregates: [{ relation: 'notes', type: 'exists' }],
      },
      contract,
    );

    expect(query.include).toEqual({
      notes: { select: { id: true, body: true } },
      _count: { select: { notes: true } },
    });
    expect(query.includeManifest).toEqual([
      { key: 'notes', relation: 'notes' },
    ]);
    expect(query.aggregateManifest).toEqual([
      {
        key: 'notes_exists',
        relation: 'notes',
        type: 'exists',
        bucketKey: 'notes',
      },
    ]);
  });

  it('rejects an avg/sum/min/max aggregate with no field', () => {
    expect(() =>
      parseSearchRequest(
        { aggregates: [{ relation: 'notes', type: 'avg' }] },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('rejects a field the referenced resource does not declare as numeric', () => {
    expect(() =>
      parseSearchRequest(
        { aggregates: [{ relation: 'notes', type: 'avg', field: 'body' }] },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('resolves an avg aggregate on a hasMany relation as a batched instruction, never through _count', () => {
    const query = parseSearchRequest(
      { aggregates: [{ relation: 'notes', type: 'avg', field: 'likes' }] },
      contract,
    );

    expect(query.include).toBeUndefined();
    expect(query.relationInstructions).toEqual([
      {
        kind: 'aggregate',
        relation: 'notes',
        aggregateKey: 'notes:avg',
        aggregateType: 'avg',
        field: 'likes',
        relationType: 'hasMany',
        foreignKey: 'blogPostId',
        discriminator: undefined,
        discriminatorValue: undefined,
        childDelegate: 'blogPostNote',
        where: undefined,
      },
    ]);
    expect(query.aggregateManifest).toEqual([
      {
        key: 'notes_avg',
        relation: 'notes',
        type: 'avg',
        bucketKey: 'notes:avg',
      },
    ]);
  });

  it('builds a morphMany include as a batched instruction, never through Prisma include', () => {
    const query = parseSearchRequest(
      {
        includes: [
          {
            relation: 'comments',
            filters: [{ field: 'body', operator: 'like', value: 'nice' }],
            sorts: [{ field: 'createdAt', direction: 'desc' }],
          },
        ],
      },
      contract,
    );

    expect(query.include).toBeUndefined();
    expect(query.relationInstructions).toEqual([
      {
        kind: 'include',
        relation: 'comments',
        relationType: 'morphMany',
        foreignKey: 'commentableId',
        discriminator: 'commentableType',
        discriminatorValue: 'BlogPost',
        childDelegate: 'comment',
        where: { body: { contains: 'nice' } },
        orderBy: [{ createdAt: 'desc' }],
        select: { id: true, body: true },
      },
    ]);
    expect(query.includeManifest).toEqual([
      { key: 'comments', relation: 'comments' },
    ]);
  });

  it('rejects a limit on a morphMany include, which cannot be windowed per parent yet', () => {
    expect(() =>
      parseSearchRequest(
        { includes: [{ relation: 'comments', limit: 5 }] },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('resolves a morphMany aggregate as a batched instruction regardless of type', () => {
    const query = parseSearchRequest(
      { aggregates: [{ relation: 'comments', type: 'count' }] },
      contract,
    );

    expect(query.include).toBeUndefined();
    expect(query.relationInstructions).toEqual([
      {
        kind: 'aggregate',
        relation: 'comments',
        aggregateKey: 'comments:count',
        aggregateType: 'count',
        field: undefined,
        relationType: 'morphMany',
        foreignKey: 'commentableId',
        discriminator: 'commentableType',
        discriminatorValue: 'BlogPost',
        childDelegate: 'comment',
        where: undefined,
      },
    ]);
  });
});

describe('withIncludesAndAggregates', () => {
  it('renames an included relation from the raw record to its alias', () => {
    const query = parseSearchRequest(
      { includes: [{ relation: 'notes', alias: 'recentNotes' }] },
      contract,
    );

    const result = withIncludesAndAggregates(
      { id: '1' },
      { id: '1', notes: [{ id: 'n1', body: 'gym' }] },
      query,
    );

    expect(result).toEqual({
      id: '1',
      recentNotes: [{ id: 'n1', body: 'gym' }],
    });
  });

  it('turns a count aggregate into a number and an exists aggregate into a boolean', () => {
    const query = parseSearchRequest(
      {
        aggregates: [
          { relation: 'notes', type: 'count' },
          { relation: 'notes', type: 'exists', alias: 'hasNotes' },
        ],
      },
      contract,
    );

    const result = withIncludesAndAggregates(
      { id: '1' },
      { id: '1', _aggregates: { notes: 3 } },
      query,
    );

    expect(result).toEqual({ id: '1', notes_count: 3, hasNotes: true });
  });

  it('returns the view unchanged when nothing was included or aggregated', () => {
    const query = parseSearchRequest({}, contract);

    const result = withIncludesAndAggregates({ id: '1' }, { id: '1' }, query);

    expect(result).toEqual({ id: '1' });
  });
});

/**
 * Pagination is the blueprint's call: declared, the route accepts exactly those
 * page sizes; absent, it returns every match. The one thing it never does is
 * accept a page nobody offered and answer as if it had.
 */
describe('a contract that declares no pagination', () => {
  const unpaginated: ListQueryContract = {
    sorts: ['createdAt'],
    filters: ['title'],
    selects: ['id', 'title'],
  };

  it('parses to no page and no limit', () => {
    const query = parseSearchRequest({}, unpaginated);

    expect(query.page).toBeNull();
    expect(query.limit).toBeNull();
  });

  it('rejects a caller who asks for a limit', () => {
    expect(() => parseSearchRequest({ limit: 10 }, unpaginated)).toThrow(
      PaginationNotOfferedException,
    );
  });

  it('rejects a caller who asks for a page', () => {
    expect(() => parseSearchRequest({ page: 2 }, unpaginated)).toThrow(
      PaginationNotOfferedException,
    );
  });

  it('still validates everything else', () => {
    expect(() =>
      parseSearchRequest(
        { sorts: [{ field: 'nope', direction: 'asc' }] },
        unpaginated,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('rejects a cursor: there is no page for it to key into', () => {
    expect(() =>
      parseSearchRequest({ cursor: 'anything' }, unpaginated),
    ).toThrow(PaginationNotOfferedException);
  });
});

describe('cursor pagination', () => {
  function encode(
    sorts: { field: string; direction: 'asc' | 'desc'; value: unknown }[],
  ) {
    return Buffer.from(JSON.stringify({ sorts }), 'utf8').toString('base64url');
  }

  it('always carries an id tiebreaker on a paginated contract, even with no declared sort', () => {
    const query = parseSearchRequest({}, contract);
    expect(query.sorts).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'id', direction: 'desc' },
    ]);
  });

  it('appends the id tiebreaker after a caller-declared sort, in the same direction', () => {
    const query = parseSearchRequest(
      { sorts: [{ field: 'title', direction: 'asc' }] },
      contract,
    );
    expect(query.sorts).toEqual([
      { field: 'title', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
  });

  it('turns a cursor into a keyset where clause matching the resolved sort', () => {
    const cursor = encode([
      {
        field: 'createdAt',
        direction: 'desc',
        value: '2024-01-01T00:00:00.000Z',
      },
      { field: 'id', direction: 'desc', value: 'row-1' },
    ]);

    const query = parseSearchRequest({ cursor }, contract);

    expect(query.cursorWhere).toEqual({
      OR: [
        { AND: [{ createdAt: { lt: '2024-01-01T00:00:00.000Z' } }] },
        {
          AND: [
            { createdAt: { equals: '2024-01-01T00:00:00.000Z' } },
            { id: { lt: 'row-1' } },
          ],
        },
      ],
    });
  });

  it('keeps a declared filter in where and the keyset apart, so a total never counts the keyset', () => {
    const cursor = encode([
      {
        field: 'createdAt',
        direction: 'desc',
        value: '2024-01-01T00:00:00.000Z',
      },
      { field: 'id', direction: 'desc', value: 'row-1' },
    ]);

    const query = parseSearchRequest(
      {
        cursor,
        filters: [{ field: 'title', operator: '=', value: 'kept' }],
      },
      contract,
    );

    expect(query.where).toEqual({ title: { equals: 'kept' } });
    expect(query.cursorWhere).toBeDefined();
  });

  it('rejects a cursor that is not valid base64url JSON', () => {
    expect(() =>
      parseSearchRequest({ cursor: '!!not-a-cursor!!' }, contract),
    ).toThrow(InvalidQueryException);
  });

  it('rejects a cursor combined with a page number', () => {
    const cursor = encode([
      {
        field: 'createdAt',
        direction: 'desc',
        value: '2024-01-01T00:00:00.000Z',
      },
      { field: 'id', direction: 'desc', value: 'row-1' },
    ]);

    expect(() => parseSearchRequest({ cursor, page: 2 }, contract)).toThrow(
      InvalidQueryException,
    );
  });

  it('rejects a cursor built against a different sort than the one requested', () => {
    const cursor = encode([
      {
        field: 'createdAt',
        direction: 'desc',
        value: '2024-01-01T00:00:00.000Z',
      },
      { field: 'id', direction: 'desc', value: 'row-1' },
    ]);

    expect(() =>
      parseSearchRequest(
        { cursor, sorts: [{ field: 'title', direction: 'asc' }] },
        contract,
      ),
    ).toThrow(InvalidQueryException);
  });

  it('rejects a cursor naming a field the contract does not allow sorting on', () => {
    const cursor = encode([
      { field: 'reps', direction: 'asc', value: 3 },
      { field: 'id', direction: 'asc', value: 'row-1' },
    ]);

    expect(() => parseSearchRequest({ cursor }, contract)).toThrow(
      InvalidQueryException,
    );
  });

  it('rejects a cursor whose last step is not the id tiebreaker', () => {
    const cursor = encode([
      {
        field: 'createdAt',
        direction: 'desc',
        value: '2024-01-01T00:00:00.000Z',
      },
    ]);

    expect(() => parseSearchRequest({ cursor }, contract)).toThrow(
      InvalidQueryException,
    );
  });
});

describe('nextCursorFor', () => {
  const sorts = [
    { field: 'createdAt', direction: 'desc' as const },
    { field: 'id', direction: 'desc' as const },
  ];

  it('is null when the contract has no pagination sorts to key on', () => {
    expect(nextCursorFor([{ id: 'row-1' }], undefined, 1)).toBeNull();
  });

  it('is null when there are no records', () => {
    expect(nextCursorFor([], sorts, 5)).toBeNull();
  });

  it('is null on a short page: there is nothing after it', () => {
    expect(
      nextCursorFor([{ id: 'row-1', createdAt: '2024-01-01' }], sorts, 5),
    ).toBeNull();
  });

  it('is null when the record lacks a sort field, rather than keying on undefined', () => {
    expect(nextCursorFor([{ id: 'row-1' }], sorts, 1)).toBeNull();
  });

  it('encodes the last record of a full page under the resolved sort', () => {
    const cursor = nextCursorFor(
      [
        { id: 'row-1', createdAt: '2024-01-01' },
        { id: 'row-2', createdAt: '2024-01-02' },
      ],
      sorts,
      2,
    );

    expect(cursor).not.toBeNull();
    const decoded = JSON.parse(
      Buffer.from(cursor!, 'base64url').toString('utf8'),
    ) as {
      sorts: { field: string; value: unknown }[];
    };
    expect(decoded.sorts).toEqual([
      { field: 'createdAt', direction: 'desc', value: '2024-01-02' },
      { field: 'id', direction: 'desc', value: 'row-2' },
    ]);
  });
});
