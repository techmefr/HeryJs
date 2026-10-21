import type {
  CapabilityDecision,
  CapabilityRecord,
  CapabilitySubject,
  PermissionPreset,
  RecordShare,
  ShareAccess,
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

/**
 * Whether one of the record's shares reaches the subject, directly or through
 * a team it belongs to. A write share satisfies a read, never the reverse.
 */
export function sharedAccessAllows(
  shares: readonly RecordShare[] | undefined,
  subject: CapabilitySubject,
  access: ShareAccess,
): boolean {
  return (shares ?? []).some(
    (share) =>
      (access === 'read' || share.access === 'write') &&
      (share.granteeType === 'user'
        ? share.granteeId === subject.id
        : subject.teamIds.includes(share.granteeId)),
  );
}

/**
 * `access` is passed only by a resource that opted into sharing, and only for
 * the actions a share can grant (reading and writing, never deleting). It can
 * turn a refusal into an allowance but never the reverse, and `none` stays a
 * refusal: a share extends a perimeter, it does not reopen a closed one.
 */
export function resolveCapability(
  preset: PermissionPreset,
  subject: CapabilitySubject,
  record: CapabilityRecord,
  access?: ShareAccess,
): CapabilityDecision {
  const decision = resolvePreset(preset, subject, record);

  if (
    !decision.allowed &&
    access &&
    preset !== 'none' &&
    sharedAccessAllows(record.shares, subject, access)
  ) {
    return { allowed: true, scope: 'shared' };
  }

  return decision;
}

function resolvePreset(
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
