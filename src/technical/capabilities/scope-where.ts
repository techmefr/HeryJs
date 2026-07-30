import type { CapabilitySubject, PermissionPreset } from './capabilities.types';

export type ScopeWhere = Record<string, unknown>;

// Mirror image of resolveCapability: the preset that decides on a loaded record
// builds the filter that scopes a collection, against the same two columns. A
// record can therefore never be hidden from the detail route and handed out by
// the list route, which is the failure mode this pair exists to prevent.
export function scopeWhereFor(
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
