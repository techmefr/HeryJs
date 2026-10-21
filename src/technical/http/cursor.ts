import { InvalidQueryException } from '#technical/errors/invalid-query.exception';

export type CursorDirection = 'asc' | 'desc';
export type CursorValue = string | number | boolean | null;

export interface CursorSortStep {
  field: string;
  direction: CursorDirection;
  value: CursorValue;
}

export interface CursorPayload {
  sorts: CursorSortStep[];
}

export function encodeCursor(
  record: Record<string, unknown>,
  sorts: readonly { field: string; direction: CursorDirection }[],
): string {
  const payload: CursorPayload = {
    sorts: sorts.map((sort) => ({
      field: sort.field,
      direction: sort.direction,
      value: normalizeCursorValue(record[sort.field]),
    })),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function normalizeCursorValue(value: unknown): CursorValue {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  return JSON.stringify(value);
}

function isCursorSortStep(value: unknown): value is CursorSortStep {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const step = value as Record<string, unknown>;

  return (
    typeof step.field === 'string' &&
    (step.direction === 'asc' || step.direction === 'desc') &&
    (step.value === null ||
      typeof step.value === 'string' ||
      typeof step.value === 'number' ||
      typeof step.value === 'boolean')
  );
}

export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown;

  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidQueryException('cursor', []);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { sorts?: unknown }).sorts) ||
    (parsed as { sorts: unknown[] }).sorts.length === 0 ||
    !(parsed as { sorts: unknown[] }).sorts.every(isCursorSortStep)
  ) {
    throw new InvalidQueryException('cursor', []);
  }

  return parsed as CursorPayload;
}

export function buildCursorWhere(
  payload: CursorPayload,
): Record<string, unknown> {
  const { sorts } = payload;
  const branches: Record<string, unknown>[] = [];

  for (let i = 0; i < sorts.length; i++) {
    const step = sorts[i]!;
    const comparator = step.direction === 'asc' ? 'gt' : 'lt';
    const equalities = sorts
      .slice(0, i)
      .map((prior) => ({ [prior.field]: { equals: prior.value } }));

    branches.push({
      AND: [...equalities, { [step.field]: { [comparator]: step.value } }],
    });
  }

  return branches.length === 1 ? branches[0]! : { OR: branches };
}
