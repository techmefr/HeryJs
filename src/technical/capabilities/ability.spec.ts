import { ability, adminAbility, everyone } from './ability';
import type { CapabilitySubject } from './capabilities.types';

const subject = (
  role: string | null,
  teamIds: string[] = [],
): CapabilitySubject => ({
  id: 'user-1',
  teamIds,
  currentTeamId: teamIds[0] ?? null,
  role,
});

describe('ability', () => {
  it('grants the whole scope when the predicate passes', () => {
    expect(adminAbility(subject('admin'))).toEqual({
      allowed: true,
      scope: 'all',
    });
  });

  /**
   * A refusal carries no scope on purpose: a decision that is both denied and
   * scoped invites a caller to read the scope and act on it, which is how a
   * "no" quietly becomes a narrower "yes".
   */
  it('refuses without a scope', () => {
    expect(adminAbility(subject('member'))).toEqual({ allowed: false });
  });

  it('treats a caller with no role as not admin', () => {
    expect(adminAbility(subject(null)).allowed).toBe(false);
  });

  it('carries the scope the capability declares, not always all', () => {
    const canManageOwnTeam = ability(
      (caller) => caller.teamIds.length > 0,
      'team',
    );

    expect(canManageOwnTeam(subject('member', ['team-1']))).toEqual({
      allowed: true,
      scope: 'team',
    });
    expect(canManageOwnTeam(subject('member'))).toEqual({ allowed: false });
  });

  it('lets a perimeter admit everyone while still bounding what they see', () => {
    expect(everyone('own')(subject('member'))).toEqual({
      allowed: true,
      scope: 'own',
    });
  });

  // It never receives a record: that is what separates it from a resource
  // policy, and passing one must not change the answer.
  it('ignores a record it was handed anyway', () => {
    expect(adminAbility(subject('admin'), { ownerId: 'someone-else' })).toEqual(
      { allowed: true, scope: 'all' },
    );
  });
});
