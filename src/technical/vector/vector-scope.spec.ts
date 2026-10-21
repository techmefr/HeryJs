import { scopeWhereFor } from '#technical/capabilities/scope-where';
import type { CapabilitySubject } from '#technical/capabilities/capabilities.types';
import { vectorScopeFrom } from './vector-scope';

const subject: CapabilitySubject = {
  id: 'user-1',
  teamIds: ['team-a', 'team-b'],
  currentTeamId: 'team-a',
  role: null,
};

describe('vectorScopeFrom', () => {
  it('reads every clause scopeWhereFor can produce', () => {
    expect(vectorScopeFrom(scopeWhereFor('all', subject))).toEqual({
      kind: 'all',
    });
    expect(vectorScopeFrom(scopeWhereFor('own', subject))).toEqual({
      kind: 'owner',
      ownerId: 'user-1',
    });
    expect(vectorScopeFrom(scopeWhereFor('team', subject))).toEqual({
      kind: 'teams',
      teams: ['team-a', 'team-b'],
    });
    expect(vectorScopeFrom(scopeWhereFor('none', subject))).toEqual({
      kind: 'none',
    });
  });

  it('treats a team preset with no teams as no access, not as every row', () => {
    expect(
      vectorScopeFrom(scopeWhereFor('team', { ...subject, teamIds: [] })),
    ).toEqual({ kind: 'none' });
  });

  it('refuses a clause it does not understand rather than dropping it', () => {
    expect(() => vectorScopeFrom({ status: 'open' })).toThrow(
      /cannot apply the scope clause/,
    );
    expect(() => vectorScopeFrom({ ownerId: 'a', teamId: { in: [] } })).toThrow(
      /cannot apply the scope clause/,
    );
  });
});
