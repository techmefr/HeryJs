import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { parseSearchRequest, type ListQueryContract } from './list-query';

const contract: ListQueryContract = {
  sorts: ['title', 'createdAt'],
  filters: ['title', 'reps'],
  selects: ['id', 'title', 'reps', 'createdAt'],
  limits: [10, 15, 20],
  defaultLimit: 15,
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

    expect(query.sorts).toEqual([{ field: 'title', direction: 'asc' }]);
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

    expect(query.where).toEqual({
      AND: [{ title: { equals: 'gym' } }],
    });
  });

  it('builds the where fragment from the validated operator, never from the raw value', () => {
    const query = parseSearchRequest(
      { filters: [{ field: 'reps', operator: '>=', value: 10 }] },
      contract,
    );

    expect(query.where).toEqual({ AND: [{ reps: { gte: 10 } }] });
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

    expect(query.where).toEqual({ AND: [{ reps: { in: [5, 10] } }] });
  });

  it('groups and-typed and or-typed filters into separate branches', () => {
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
      AND: [
        { AND: [{ title: { equals: 'gym' } }] },
        { OR: [{ reps: { gt: 5 } }] },
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
      OR: [
        {
          AND: [
            { AND: [{ title: { equals: 'gym' } }] },
            { OR: [{ reps: { gt: 5 } }] },
          ],
        },
      ],
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
});
