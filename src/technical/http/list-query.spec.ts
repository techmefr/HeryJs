import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { parseSearchRequest, type ListQueryContract } from './list-query';

const contract: ListQueryContract = {
  sorts: ['title', 'createdAt'],
  filters: ['title'],
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

  it('parses a leading dash as descending order', () => {
    const query = parseSearchRequest({ sort: '-createdAt' }, contract);

    expect(query.sort).toEqual({ field: 'createdAt', direction: 'desc' });
  });

  it('parses a plain field name as ascending order', () => {
    const query = parseSearchRequest({ sort: 'title' }, contract);

    expect(query.sort).toEqual({ field: 'title', direction: 'asc' });
  });

  it('rejects a sort field the contract does not list', () => {
    expect(() => parseSearchRequest({ sort: 'secret' }, contract)).toThrow(
      InvalidQueryException,
    );
  });

  it('rejects a filter field the contract does not list', () => {
    expect(() =>
      parseSearchRequest({ filters: { secret: 'x' } }, contract),
    ).toThrow(InvalidQueryException);
  });

  it('passes an allow-listed filter through', () => {
    const query = parseSearchRequest({ filters: { title: 'gym' } }, contract);

    expect(query.filters).toEqual({ title: 'gym' });
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
