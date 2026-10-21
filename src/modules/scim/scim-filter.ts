import { ScimException } from './scim.exception';
import type { ScimListQuery } from './scim.types';
import { SCIM_MAX_COUNT } from './scim.types';

const FILTERABLE: Record<'user' | 'group', readonly string[]> = {
  user: ['username', 'externalid'],
  group: ['displayname', 'externalid'],
};

const EQUALITY = /^\s*([A-Za-z][\w.]*)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i;

/**
 * The one filter shape directories use to find a resource they may already
 * have created -- `userName eq "jane@acme.com"`, `externalId eq "..."` --
 * and nothing wider. Anything else is refused as `invalidFilter` rather than
 * half-answered, and ServiceProviderConfig says so.
 */
export function parseScimFilter(
  filter: string | undefined,
  kind: 'user' | 'group',
): ScimListQuery['filter'] {
  if (filter === undefined || filter.trim() === '') {
    return null;
  }

  const match = EQUALITY.exec(filter);
  const attribute = match?.[1]?.toLowerCase();

  if (!match || !attribute || !FILTERABLE[kind].includes(attribute)) {
    throw ScimException.badRequest(
      `Only an "eq" filter on ${FILTERABLE[kind].join(' or ')} is supported.`,
      'invalidFilter',
    );
  }

  return {
    attribute,
    value: (match[2] ?? '').replace(/\\(.)/g, '$1'),
  };
}

function integer(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw ScimException.badRequest('Not an integer.', 'invalidValue');
  }

  return parsed;
}

/** startIndex is 1-based and a value below 1 is 1; a count below 0 is 0 (RFC 7644 section 3.4.2.4). */
export function parseScimListQuery(
  query: { filter?: string; startIndex?: string; count?: string },
  kind: 'user' | 'group',
): ScimListQuery {
  return {
    filter: parseScimFilter(query.filter, kind),
    startIndex: Math.max(1, integer(query.startIndex, 1)),
    count: Math.min(
      SCIM_MAX_COUNT,
      Math.max(0, integer(query.count, SCIM_MAX_COUNT)),
    ),
  };
}
