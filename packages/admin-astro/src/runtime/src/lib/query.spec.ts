import { describe, expect, it } from 'vitest';
import {
  clauseOf,
  clausesOf,
  initialState,
  isSearchable,
  nextSort,
  operatorsFor,
  pageLabel,
  searchBody,
} from './query';
import { mockDescription } from './resource.fixture';

describe('the starting query', () => {
  it('starts on the default page size of a paginated resource', () => {
    expect(initialState(mockDescription)).toEqual({
      search: '',
      filters: [],
      sort: null,
      page: 1,
      limit: 15,
      trashed: false,
    });
  });

  it('has no page size for a resource that does not paginate', () => {
    expect(
      initialState({ ...mockDescription, paginated: false }).limit,
    ).toBeNull();
  });
});

describe('the search body', () => {
  it('asks for nothing it was not given', () => {
    expect(
      searchBody(
        { ...mockDescription, paginated: false },
        initialState({ ...mockDescription, paginated: false }),
        ['update'],
      ),
    ).toEqual({ capabilities: ['update'] });
  });

  it('never sends a page to a resource that does not paginate', () => {
    const description = { ...mockDescription, paginated: false };
    const body = searchBody(
      description,
      { ...initialState(description), page: 3, limit: 10 },
      [],
    );

    expect(body.page).toBeUndefined();
    expect(body.limit).toBeUndefined();
  });

  it('drops a sort the contract does not declare', () => {
    const state = {
      ...initialState(mockDescription),
      sort: { field: 'views', direction: 'asc' as const },
    };

    expect(searchBody(mockDescription, state, []).sorts).toBeUndefined();
  });

  it('trims the search term and skips a blank one', () => {
    const state = initialState(mockDescription);

    expect(
      searchBody(mockDescription, { ...state, search: '  squat ' }, []).search,
    ).toEqual({ q: 'squat' });
    expect(
      searchBody(mockDescription, { ...state, search: '   ' }, []).search,
    ).toBeUndefined();
  });

  it('does not search a resource that has no text field', () => {
    const description = {
      ...mockDescription,
      fields: mockDescription.fields.filter((field) => field.type !== 'string'),
    };

    expect(isSearchable(description)).toBe(false);
    expect(
      searchBody(description, { ...initialState(description), search: 'x' }, [])
        .search,
    ).toBeUndefined();
  });
});

describe('filters', () => {
  it('offers the operators that make sense for a type', () => {
    expect(operatorsFor(mockDescription, 'title')).toContain('like');
    expect(operatorsFor(mockDescription, 'views')).toContain('>=');
    expect(operatorsFor(mockDescription, 'views')).not.toContain('like');
    expect(operatorsFor(mockDescription, 'isPublished')).toEqual(['=', '!=']);
    expect(operatorsFor(mockDescription, 'id')).toContain('in');
  });

  it('refuses a field the contract does not filter on', () => {
    expect(
      clauseOf(mockDescription, { field: 'secret', operator: '=', value: 'x' }),
    ).toBe('secret cannot be filtered');
  });

  it('refuses an operator the type cannot use', () => {
    expect(
      clauseOf(mockDescription, {
        field: 'views',
        operator: 'like',
        value: '1',
      }),
    ).toBe('like does not apply to views');
  });

  it('turns a boolean into a boolean and rejects anything else', () => {
    expect(
      clauseOf(mockDescription, {
        field: 'isPublished',
        operator: '=',
        value: 'true',
      }),
    ).toEqual({ field: 'isPublished', operator: '=', value: true });
    expect(
      clauseOf(mockDescription, {
        field: 'isPublished',
        operator: '=',
        value: 'yes',
      }),
    ).toBe('isPublished needs a valid boolean');
  });

  it('turns a date into an iso timestamp', () => {
    expect(
      clauseOf(mockDescription, {
        field: 'publishedAt',
        operator: '>',
        value: '2026-01-02T03:04',
      }),
    ).toEqual({
      field: 'publishedAt',
      operator: '>',
      value: new Date('2026-01-02T03:04').toISOString(),
    });
  });

  it('splits an in list and converts each value', () => {
    expect(
      clauseOf(mockDescription, {
        field: 'views',
        operator: 'in',
        value: '1, 2,3',
      }),
    ).toEqual({ field: 'views', operator: 'in', value: [1, 2, 3] });
  });

  it('refuses an in list with a bad value or none at all', () => {
    expect(
      clauseOf(mockDescription, {
        field: 'views',
        operator: 'in',
        value: '1,x',
      }),
    ).toBe('Give views a comma separated list of valid values');
    expect(
      clauseOf(mockDescription, {
        field: 'views',
        operator: 'in',
        value: ' , ',
      }),
    ).toBe('Give views a comma separated list of valid values');
  });

  it('skips blank rows and reports the broken ones', () => {
    expect(
      clausesOf(mockDescription, [
        { field: 'title', operator: '=', value: '' },
        { field: 'views', operator: '=', value: 'abc' },
        { field: 'title', operator: 'like', value: 'squat' },
      ]),
    ).toEqual({
      clauses: [{ field: 'title', operator: 'like', value: 'squat' }],
      problems: ['views needs a valid number'],
    });
  });
});

describe('sorting and paging helpers', () => {
  it('cycles ascending, descending, none', () => {
    const first = nextSort(null, 'title');
    const second = nextSort(first, 'title');

    expect(first).toEqual({ field: 'title', direction: 'asc' });
    expect(second).toEqual({ field: 'title', direction: 'desc' });
    expect(nextSort(second, 'title')).toBeNull();
    expect(nextSort(second, 'createdAt')).toEqual({
      field: 'createdAt',
      direction: 'asc',
    });
  });

  it('labels a page, a lone record and an unpaged total', () => {
    expect(pageLabel({ page: 2, last_page: 4, total: 40 })).toBe(
      '40 records - page 2 of 4',
    );
    expect(pageLabel({ page: 1, last_page: 1, total: 1 })).toBe(
      '1 record - page 1 of 1',
    );
    expect(pageLabel({ total: 7 })).toBe('7 records');
    expect(pageLabel({})).toBe('');
  });
});
