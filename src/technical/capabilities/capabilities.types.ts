export type PermissionPreset = 'all' | 'team' | 'own' | 'none';

/**
 * `shared` is not a preset: no blueprint declares it. It is what a decision
 * reports when it was allowed by a share on the record rather than by the
 * resource's own preset.
 */
export type CapabilityScope = Exclude<PermissionPreset, 'none'> | 'shared';

export type ShareAccess = 'read' | 'write';

export type ShareGranteeType = 'user' | 'team';

export interface RecordShare {
  granteeType: ShareGranteeType;
  granteeId: string;
  access: ShareAccess;
}

export interface CapabilityDecision {
  allowed: boolean;
  scope?: CapabilityScope;
}

export interface CapabilitySubject {
  id: string;
  teamIds: string[];
  currentTeamId: string | null;
  role: string | null;
}

export interface CapabilityRecord {
  ownerId: string;
  teamId?: string;
  /**
   * The shares on this record, loaded in the same step as the record itself
   * (one query for a whole page, never one per row), so that a decision stays
   * a pure function of the subject and what was already fetched.
   */
  shares?: readonly RecordShare[];
}
