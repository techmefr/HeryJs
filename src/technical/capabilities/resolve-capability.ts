import type {
  CapabilityDecision,
  CapabilityRecord,
  CapabilitySubject,
  PermissionPreset,
} from './capabilities.types';

export function resolveCollectionCapability(
  preset: PermissionPreset,
  subject: CapabilitySubject,
): CapabilityDecision {
  switch (preset) {
    case 'none':
      return { allowed: false };
    case 'team':
      return subject.teamIds.length > 0
        ? { allowed: true, scope: 'team' }
        : { allowed: false };
    case 'own':
      return { allowed: true, scope: 'own' };
    case 'all':
      return { allowed: true, scope: 'all' };
  }
}

export function resolveCapability(
  preset: PermissionPreset,
  subject: CapabilitySubject,
  record: CapabilityRecord,
): CapabilityDecision {
  switch (preset) {
    case 'none':
      return { allowed: false };
    case 'all':
      return { allowed: true, scope: 'all' };
    case 'own': {
      const allowed = record.ownerId === subject.id;
      return allowed ? { allowed, scope: 'own' } : { allowed };
    }
    case 'team': {
      const allowed =
        record.teamId !== undefined && subject.teamIds.includes(record.teamId);
      return allowed ? { allowed, scope: 'team' } : { allowed };
    }
  }
}
