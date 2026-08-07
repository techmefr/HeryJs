import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import {
  DEFAULT_PAGE_LIMIT,
  okPage,
  parsePageQuery,
  PAGE_LIMITS,
} from './page-query';

/**
 * One convention for every collection this framework writes itself, so a client
 * reads the same meta whether the rows came from a blueprint or from the kernel,
 * and a route that returns a whole table cannot ship by accident.
 */
describe('parsePageQuery', () => {
  it('defaults to the first page and the conventional page size', () => {
    expect(parsePageQuery({})).toEqual({
      page: 1,
      limit: DEFAULT_PAGE_LIMIT,
      skip: 0,
      take: DEFAULT_PAGE_LIMIT,
    });
  });

  it('reads the strings a query string actually delivers', () => {
    expect(parsePageQuery({ page: '3', limit: '10' })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
      take: 10,
    });
  });

  it('rejects a page size outside the convention', () => {
    expect(() => parsePageQuery({ limit: '7' })).toThrow(InvalidQueryException);
    expect(() => parsePageQuery({ limit: '1000' })).toThrow(
      InvalidQueryException,
    );
  });

  it('rejects a page that is not a positive integer', () => {
    expect(() => parsePageQuery({ page: '0' })).toThrow(InvalidQueryException);
    expect(() => parsePageQuery({ page: '-2' })).toThrow(InvalidQueryException);
    expect(() => parsePageQuery({ page: 'two' })).toThrow(
      InvalidQueryException,
    );
  });

  it('accepts every page size it advertises', () => {
    for (const limit of PAGE_LIMITS) {
      expect(parsePageQuery({ limit: String(limit) }).limit).toBe(limit);
    }
  });
});

describe('okPage', () => {
  it('reports the same window a generated resource reports', () => {
    const query = parsePageQuery({ page: '2', limit: '10' });

    expect(okPage({ records: [{ id: 'a' }], total: 34 }, query)).toEqual({
      data: [{ id: 'a' }],
      meta: { page: 2, limit: 10, total: 34, last_page: 4 },
      messages: [],
    });
  });

  it('reports one page when the collection is empty rather than zero', () => {
    const query = parsePageQuery({});

    expect(okPage({ records: [], total: 0 }, query).meta.last_page).toBe(1);
  });

  it('keeps whatever the route reports alongside the window', () => {
    const query = parsePageQuery({});

    expect(
      okPage({ records: [], total: 0 }, query, { currentTeamId: 'team-1' }).meta
        .currentTeamId,
    ).toBe('team-1');
  });
});
