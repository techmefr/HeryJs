import type { PolicyCheck } from '#technical/capabilities/capability-check';

// Membership is a perimeter every signed-in caller is inside of, so these four
// answer "may a caller act on its own memberships at all", never "on whose".
// The record-level question -- is this caller in *that* team -- cannot be
// answered from a subject alone and stays in the controller, which checks the
// session's own memberships before touching a team it names.
export const canListOwnTeams: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});

export const canCreateTeam: PolicyCheck = () => ({
  allowed: true,
  scope: 'own',
});

export const canManageTeamMembers: PolicyCheck = (subject) =>
  subject.teamIds.length > 0
    ? { allowed: true, scope: 'team' }
    : { allowed: false };

export const canSwitchCurrentTeam: PolicyCheck = (subject) =>
  subject.teamIds.length > 0
    ? { allowed: true, scope: 'team' }
    : { allowed: false };
