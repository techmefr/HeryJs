export type PermissionPreset = 'all' | 'team' | 'own' | 'none';

export type CapabilityScope = Exclude<PermissionPreset, 'none'>;

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
}
