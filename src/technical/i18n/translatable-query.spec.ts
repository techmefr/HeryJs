import {
  hasTranslatableSort,
  matchesTranslatedText,
  matchesTranslatableFilter,
  resolveTranslatableFilters,
  sortByResolvedTranslations,
  TRANSLATABLE_FILTER_KEY,
} from './translatable-query';
import type { TranslatableRow } from './translatable-query';

const rows: TranslatableRow[] = [
  { id: 'a', value: { en: 'apple', fr: 'pomme' } },
  { id: 'b', value: { en: 'banana' } },
  { id: 'c', value: null },
];

describe('matchesTranslatableFilter', () => {
  const filter = (operator: string, value: unknown) =>
    ({ field: 'title', operator, value }) as Parameters<
      typeof matchesTranslatableFilter
    >[1];

  it('compares the resolved text for each operator', () => {
    expect(matchesTranslatableFilter('apple', filter('=', 'apple'))).toBe(true);
    expect(matchesTranslatableFilter('apple', filter('!=', 'apple'))).toBe(
      false,
    );
    expect(matchesTranslatableFilter('apple', filter('like', 'ppl'))).toBe(
      true,
    );
    expect(matchesTranslatableFilter('apple', filter('not like', 'ppl'))).toBe(
      false,
    );
    expect(
      matchesTranslatableFilter('apple', filter('in', ['apple', 'x'])),
    ).toBe(true);
    expect(
      matchesTranslatableFilter('apple', filter('not in', ['apple'])),
    ).toBe(false);
  });

  it('never matches a row that has no resolved text', () => {
    expect(matchesTranslatableFilter(null, filter('!=', 'apple'))).toBe(false);
    expect(matchesTranslatableFilter(null, filter('not in', ['apple']))).toBe(
      false,
    );
  });
});

describe('resolveTranslatableFilters', () => {
  const marker = (operator: string, value: unknown) => ({
    [TRANSLATABLE_FILTER_KEY]: { field: 'title', operator, value },
  });

  it('turns a marker into the ids whose resolved text matches', async () => {
    const result = await resolveTranslatableFilters(
      marker('=', 'pomme'),
      () => Promise.resolve(rows),
      ['fr', 'en'],
    );

    expect(result).toEqual({ id: { in: ['a'] } });
  });

  it('resolves through the fallback chain', async () => {
    const result = await resolveTranslatableFilters(
      marker('=', 'banana'),
      () => Promise.resolve(rows),
      ['fr', 'en'],
    );

    expect(result).toEqual({ id: { in: ['b'] } });
  });

  it('keeps the rest of the where tree and loads each field once', async () => {
    const loader = jest.fn(() => Promise.resolve(rows));
    const result = await resolveTranslatableFilters(
      {
        AND: [
          { ownerId: 'u1' },
          { OR: [marker('like', 'a'), marker('like', 'n')] },
        ],
        createdAt: { gte: new Date(0) },
      },
      loader,
      ['en'],
    );

    expect(result).toEqual({
      AND: [
        { ownerId: 'u1' },
        { OR: [{ id: { in: ['a', 'b'] } }, { id: { in: ['b'] } }] },
      ],
      createdAt: { gte: new Date(0) },
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('sortByResolvedTranslations', () => {
  const records = [
    { id: '1', title: { en: 'banana' }, rank: 2 },
    { id: '2', title: { en: 'apple' }, rank: 2 },
    { id: '3', title: null, rank: 1 },
    { id: '4', title: { fr: 'cerise', en: 'cherry' }, rank: 3 },
  ];

  it('orders by the resolved text, empty ones last when ascending', () => {
    const sorted = sortByResolvedTranslations(
      records,
      [{ field: 'title', direction: 'asc' }],
      ['title'],
      ['en'],
    );

    expect(sorted.map((row) => row.id)).toEqual(['2', '1', '4', '3']);
  });

  it('reverses a descending sort and follows the locale chain', () => {
    const sorted = sortByResolvedTranslations(
      records,
      [{ field: 'title', direction: 'desc' }],
      ['title'],
      ['fr', 'en'],
    );

    expect(sorted.map((row) => row.id)).toEqual(['3', '4', '1', '2']);
  });

  it('breaks a tie with the next sort, translatable or not', () => {
    const sorted = sortByResolvedTranslations(
      records,
      [
        { field: 'rank', direction: 'asc' },
        { field: 'title', direction: 'asc' },
      ],
      ['title'],
      ['en'],
    );

    expect(sorted.map((row) => row.id)).toEqual(['3', '2', '1', '4']);
  });

  it('knows when a sort list touches a translatable field', () => {
    expect(
      hasTranslatableSort([{ field: 'title', direction: 'asc' }], ['title']),
    ).toBe(true);
    expect(
      hasTranslatableSort([{ field: 'rank', direction: 'asc' }], ['title']),
    ).toBe(false);
    expect(hasTranslatableSort(undefined, ['title'])).toBe(false);
  });
});

describe('matchesTranslatedText', () => {
  it('matches the resolved locale only, ignoring case', () => {
    const value = { en: 'Hello World', fr: 'Bonjour' };

    expect(matchesTranslatedText(value, 'hello', ['en'])).toBe(true);
    expect(matchesTranslatedText(value, 'hello', ['fr'])).toBe(false);
    expect(matchesTranslatedText(null, 'hello', ['en'])).toBe(false);
  });
});
