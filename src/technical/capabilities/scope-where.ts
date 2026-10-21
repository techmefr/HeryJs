import type { CapabilitySubject, PermissionPreset } from './capabilities.types';

export type ScopeWhere = Record<string, unknown>;

// Mirror image of resolveCapability: the preset that decides on a loaded record
// builds the filter that scopes a collection, against the same two columns. A
// record can therefore never be hidden from the detail route and handed out by
// the list route, which is the failure mode this pair exists to prevent.
//
// `sharedIds` is the set of record ids shared with the subject, fetched once
// for the request by the sharing service: a share widens the preset's own
// filter with an OR instead of a query per row. `none` and `all` have nothing
// to widen, and an empty set changes nothing.
export function scopeWhereFor(
  preset: PermissionPreset,
  subject: CapabilitySubject,
  sharedIds?: readonly string[],
): ScopeWhere {
  const own = presetWhere(preset, subject);

  if (!sharedIds || sharedIds.length === 0 || preset === 'none') {
    return own;
  }

  return preset === 'all' ? own : { OR: [own, { id: { in: [...sharedIds] } }] };
}

function presetWhere(
  preset: PermissionPreset,
  subject: CapabilitySubject,
): ScopeWhere {
  switch (preset) {
    case 'none':
      return { id: { in: [] } };
    case 'all':
      return {};
    case 'own':
      return { ownerId: subject.id };
    case 'team':
      return { teamId: { in: subject.teamIds } };
  }
}
