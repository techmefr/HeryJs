import type { AuthenticatedUser } from '#technical/auth/auth.types';
import type { CapabilitySubject } from './capabilities.types';

/**
 * The only place a capability subject is built. Every call site used to write
 * the object literal itself, which is how `teamIds` stayed hardcoded to an
 * empty array in thirteen places and made the team preset deny everyone.
 */
export function subjectOf(user: AuthenticatedUser): CapabilitySubject {
  return {
    id: user.id,
    teamIds: user.teamIds,
    currentTeamId: user.currentTeamId,
    role: user.role,
  };
}
