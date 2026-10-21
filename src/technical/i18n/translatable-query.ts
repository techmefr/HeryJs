import { currentLocaleChain, resolveTranslation } from './translatable';

export interface TranslatableSort {
  field: string;
  direction: 'asc' | 'desc';
}

export const TRANSLATABLE_FILTER_KEY = '$translatable';

export const TRANSLATABLE_FILTER_OPERATORS = [
  '=',
  '!=',
  'like',
  'not like',
  'in',
  'not in',
] as const;
export type TranslatableFilterOperator =
  (typeof TRANSLATABLE_FILTER_OPERATORS)[number];

export interface TranslatableFilter {
  field: string;
  operator: TranslatableFilterOperator;
  value: string | number | boolean | (string | number)[] | undefined;
}

export interface TranslatableRow {
  id: string;
  value: unknown;
}

export type TranslatableRowLoader = (
  field: string,
) => Promise<TranslatableRow[]>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isTranslatableFilter(value: unknown): value is TranslatableFilter {
  return isPlainObject(value) && typeof value.field === 'string';
}

export function matchesTranslatableFilter(
  resolved: string | null,
  filter: TranslatableFilter,
): boolean {
  if (resolved === null) {
    return false;
  }

  const { operator, value } = filter;
  const list = Array.isArray(value) ? value.map(String) : [];
  const scalar = String(value);

  switch (operator) {
    case '=':
      return resolved === scalar;
    case '!=':
      return resolved !== scalar;
    case 'like':
      return resolved.includes(scalar);
    case 'not like':
      return !resolved.includes(scalar);
    case 'in':
      return list.includes(resolved);
    case 'not in':
      return !list.includes(resolved);
  }
}

export async function resolveTranslatableFilters(
  node: unknown,
  loadRows: TranslatableRowLoader,
  chain: readonly string[] = currentLocaleChain(),
): Promise<unknown> {
  const cache = new Map<string, Promise<TranslatableRow[]>>();

  const rowsFor = (field: string): Promise<TranslatableRow[]> => {
    const cached = cache.get(field);

    if (cached) {
      return cached;
    }

    const loaded = loadRows(field);
    cache.set(field, loaded);

    return loaded;
  };

  const walk = async (current: unknown): Promise<unknown> => {
    if (Array.isArray(current)) {
      return Promise.all(current.map(walk));
    }

    if (!isPlainObject(current)) {
      return current;
    }

    const marker = current[TRANSLATABLE_FILTER_KEY];

    if (isTranslatableFilter(marker)) {
      const rows = await rowsFor(marker.field);

      return {
        id: {
          in: rows
            .filter((row) =>
              matchesTranslatableFilter(
                resolveTranslation(row.value, chain),
                marker,
              ),
            )
            .map((row) => row.id),
        },
      };
    }

    const entries = await Promise.all(
      Object.entries(current).map(
        async ([key, value]) => [key, await walk(value)] as const,
      ),
    );

    return Object.fromEntries(entries);
  };

  return walk(node);
}

function comparable(value: unknown): number | string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  return typeof value === 'boolean' ? Number(value) : null;
}

function compareValues(
  left: number | string | null,
  right: number | string | null,
  collator: Intl.Collator,
): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  if (typeof left === 'string' && typeof right === 'string') {
    return collator.compare(left, right);
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

export function hasTranslatableSort(
  sorts: readonly TranslatableSort[] | undefined,
  translatable: readonly string[],
): boolean {
  return (sorts ?? []).some((sort) => translatable.includes(sort.field));
}

export function sortByResolvedTranslations<T extends Record<string, unknown>>(
  rows: readonly T[],
  sorts: readonly TranslatableSort[],
  translatable: readonly string[],
  chain: readonly string[] = currentLocaleChain(),
): T[] {
  const collator = new Intl.Collator(chain[0]);

  const valueOf = (row: T, field: string): number | string | null =>
    translatable.includes(field)
      ? resolveTranslation(row[field], chain)
      : comparable(row[field]);

  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const order = compareValues(
        valueOf(a, sort.field),
        valueOf(b, sort.field),
        collator,
      );

      if (order !== 0) {
        return sort.direction === 'desc' ? -order : order;
      }
    }

    return 0;
  });
}

export function matchesTranslatedText(
  value: unknown,
  term: string,
  chain: readonly string[] = currentLocaleChain(),
): boolean {
  const resolved = resolveTranslation(value, chain);

  return (
    resolved !== null && resolved.toLowerCase().includes(term.toLowerCase())
  );
}
