import type {
  FieldType,
  FilterClause,
  ResourceDescription,
  SearchBody,
} from './resource';

export type SortDirection = 'asc' | 'desc';

export interface FilterRow {
  field: string;
  operator: string;
  value: string;
}

export interface QueryState {
  search: string;
  filters: FilterRow[];
  sort: { field: string; direction: SortDirection } | null;
  page: number;
  limit: number | null;
  trashed: boolean;
}

const MAX_IN_VALUES = 500;

const OPERATORS_BY_TYPE: Record<FieldType, string[]> = {
  string: ['=', '!=', 'like', 'not like', 'in', 'not in'],
  file: ['=', '!=', 'like', 'not like', 'in', 'not in'],
  slug: ['=', '!=', 'like', 'not like', 'in', 'not in'],
  richtext: [],
  int: ['=', '!=', '>', '>=', '<', '<=', 'in', 'not in'],
  datetime: ['=', '!=', '>', '>=', '<', '<='],
  boolean: ['=', '!='],
};

export function typeOfFilterField(
  description: ResourceDescription,
  field: string,
): FieldType {
  return (
    description.fields.find((item) => item.name === field)?.type ?? 'string'
  );
}

export function operatorsFor(
  description: ResourceDescription,
  field: string,
): string[] {
  return OPERATORS_BY_TYPE[typeOfFilterField(description, field)];
}

export function initialState(description: ResourceDescription): QueryState {
  return {
    search: '',
    filters: [],
    sort: null,
    page: 1,
    limit: description.paginated ? (description.defaultLimit ?? null) : null,
    trashed: false,
  };
}

export function isSearchable(description: ResourceDescription): boolean {
  return description.fields.some((field) => field.type === 'string');
}

export function nextSort(
  current: QueryState['sort'],
  field: string,
): QueryState['sort'] {
  if (current?.field !== field) {
    return { field, direction: 'asc' };
  }

  return current.direction === 'asc' ? { field, direction: 'desc' } : null;
}

type Scalar = string | number | boolean;

function scalarOf(type: FieldType, text: string): Scalar | null {
  if (type === 'int') {
    const number = Number(text);

    return text.trim() === '' || Number.isNaN(number) ? null : number;
  }

  if (type === 'boolean') {
    return text === 'true' || text === 'false' ? text === 'true' : null;
  }

  if (type === 'datetime') {
    const date = new Date(text);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return text;
}

export function clauseOf(
  description: ResourceDescription,
  row: FilterRow,
): FilterClause | string {
  if (!description.filters.includes(row.field)) {
    return row.field + ' cannot be filtered';
  }

  if (!operatorsFor(description, row.field).includes(row.operator)) {
    return row.operator + ' does not apply to ' + row.field;
  }

  const type = typeOfFilterField(description, row.field);

  if (row.operator === 'in' || row.operator === 'not in') {
    const parts = row.value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');
    const values = parts.map((part) => scalarOf(type, part));

    if (
      parts.length === 0 ||
      parts.length > MAX_IN_VALUES ||
      values.some((value) => value === null || typeof value === 'boolean')
    ) {
      return 'Give ' + row.field + ' a comma separated list of valid values';
    }

    return {
      field: row.field,
      operator: row.operator,
      value: values as (string | number)[],
    };
  }

  const value = scalarOf(type, row.value);

  if (value === null) {
    return row.field + ' needs a valid ' + (type === 'int' ? 'number' : type);
  }

  return { field: row.field, operator: row.operator, value };
}

export function clausesOf(
  description: ResourceDescription,
  rows: FilterRow[],
): { clauses: FilterClause[]; problems: string[] } {
  const clauses: FilterClause[] = [];
  const problems: string[] = [];

  for (const row of rows) {
    if (row.value.trim() === '') {
      continue;
    }

    const clause = clauseOf(description, row);

    if (typeof clause === 'string') {
      problems.push(clause);
    } else {
      clauses.push(clause);
    }
  }

  return { clauses, problems };
}

export function searchBody(
  description: ResourceDescription,
  state: QueryState,
  capabilities: string[],
): SearchBody {
  const body: SearchBody = { capabilities };
  const { clauses } = clausesOf(description, state.filters);

  if (clauses.length > 0) {
    body.filters = clauses;
  }

  if (state.sort && description.sorts.includes(state.sort.field)) {
    body.sorts = [state.sort];
  }

  const term = state.search.trim();

  if (term !== '' && isSearchable(description)) {
    body.search = { q: term };
  }

  if (description.paginated) {
    body.page = state.page;

    if (state.limit !== null) {
      body.limit = state.limit;
    }
  }

  if (state.trashed) {
    body.onlyTrashed = true;
  }

  return body;
}

export function pageLabel(meta: {
  page?: number;
  last_page?: number;
  total?: number;
}): string {
  if (meta.total === undefined) {
    return '';
  }

  if (meta.page === undefined || meta.last_page === undefined) {
    return meta.total + (meta.total === 1 ? ' record' : ' records');
  }

  return (
    meta.total +
    (meta.total === 1 ? ' record' : ' records') +
    ' - page ' +
    meta.page +
    ' of ' +
    meta.last_page
  );
}
