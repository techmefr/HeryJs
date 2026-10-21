import type { ScopeWhere } from '#technical/capabilities/scope-where';

export type VectorScope =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'owner'; ownerId: string }
  | { kind: 'teams'; teams: string[] };

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

function inList(value: unknown): string[] | null {
  if (typeof value !== 'object' || value === null || !('in' in value)) {
    return null;
  }

  return isStringArray(value.in) ? value.in : null;
}

export function vectorScopeFrom(where: ScopeWhere): VectorScope {
  const keys = Object.keys(where);

  if (keys.length === 0) {
    return { kind: 'all' };
  }

  if (keys.length > 1) {
    throw new Error(
      `A vector search cannot apply the scope clause {${keys.join(', ')}}.`,
    );
  }

  if (typeof where.ownerId === 'string') {
    return { kind: 'owner', ownerId: where.ownerId };
  }

  const teams = inList(where.teamId);

  if (teams) {
    return teams.length === 0 ? { kind: 'none' } : { kind: 'teams', teams };
  }

  const ids = inList(where.id);

  if (ids && ids.length === 0) {
    return { kind: 'none' };
  }

  throw new Error(
    `A vector search cannot apply the scope clause {${keys.join(', ')}}.`,
  );
}
