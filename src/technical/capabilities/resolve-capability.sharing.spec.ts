import type { CapabilitySubject, RecordShare } from './capabilities.types';
import { resolveCapability, sharedAccessAllows } from './resolve-capability';
import { scopeWhereFor } from './scope-where';

const subject: CapabilitySubject = {
  id: 'user-1',
  teamIds: ['team-1'],
  currentTeamId: 'team-1',
  role: null,
};

function record(shares: RecordShare[]) {
  return { ownerId: 'someone-else', teamId: 'team-9', shares };
}

describe('sharing in capability resolution', () => {
  it('matches a share naming the subject, or a team it belongs to', () => {
    expect(
      sharedAccessAllows(
        [{ granteeType: 'user', granteeId: 'user-1', access: 'read' }],
        subject,
        'read',
      ),
    ).toBe(true);
    expect(
      sharedAccessAllows(
        [{ granteeType: 'team', granteeId: 'team-1', access: 'read' }],
        subject,
        'read',
      ),
    ).toBe(true);
    expect(
      sharedAccessAllows(
        [
          { granteeType: 'user', granteeId: 'user-2', access: 'write' },
          { granteeType: 'team', granteeId: 'team-2', access: 'write' },
        ],
        subject,
        'read',
      ),
    ).toBe(false);
  });

  it('treats a user id and a team id as different things', () => {
    expect(
      sharedAccessAllows(
        [{ granteeType: 'team', granteeId: 'user-1', access: 'write' }],
        subject,
        'read',
      ),
    ).toBe(false);
  });

  it('lets write satisfy read but never read satisfy write', () => {
    const read: RecordShare[] = [
      { granteeType: 'user', granteeId: 'user-1', access: 'read' },
    ];
    const write: RecordShare[] = [
      { granteeType: 'user', granteeId: 'user-1', access: 'write' },
    ];

    expect(sharedAccessAllows(read, subject, 'write')).toBe(false);
    expect(sharedAccessAllows(write, subject, 'read')).toBe(true);
    expect(sharedAccessAllows(write, subject, 'write')).toBe(true);
  });

  it('turns a refusal into a shared allowance only when an access is asked for', () => {
    const shared = record([
      { granteeType: 'user', granteeId: 'user-1', access: 'read' },
    ]);

    expect(resolveCapability('own', subject, shared)).toEqual({
      allowed: false,
    });
    expect(resolveCapability('own', subject, shared, 'read')).toEqual({
      allowed: true,
      scope: 'shared',
    });
    expect(resolveCapability('team', subject, shared, 'write')).toEqual({
      allowed: false,
    });
  });

  it('keeps the preset scope when the preset already allows', () => {
    expect(
      resolveCapability(
        'own',
        subject,
        { ownerId: 'user-1', shares: [] },
        'read',
      ),
    ).toEqual({ allowed: true, scope: 'own' });
  });

  it('never reopens a preset of none', () => {
    const shared = record([
      { granteeType: 'user', granteeId: 'user-1', access: 'write' },
    ]);

    expect(resolveCapability('none', subject, shared, 'read')).toEqual({
      allowed: false,
    });
  });

  it('decides without a query: shares are plain data on the record', () => {
    expect(resolveCapability('own', subject, { ownerId: 'x' }, 'read')).toEqual(
      { allowed: false },
    );
  });
});

describe('sharing in the collection scope', () => {
  it('widens own and team with the shared ids', () => {
    expect(scopeWhereFor('own', subject, ['a', 'b'])).toEqual({
      OR: [{ ownerId: 'user-1' }, { id: { in: ['a', 'b'] } }],
    });
    expect(scopeWhereFor('team', subject, ['a'])).toEqual({
      OR: [{ teamId: { in: ['team-1'] } }, { id: { in: ['a'] } }],
    });
  });

  it('changes nothing without shares, and nothing for all or none', () => {
    expect(scopeWhereFor('own', subject)).toEqual({ ownerId: 'user-1' });
    expect(scopeWhereFor('own', subject, [])).toEqual({ ownerId: 'user-1' });
    expect(scopeWhereFor('all', subject, ['a'])).toEqual({});
    expect(scopeWhereFor('none', subject, ['a'])).toEqual({ id: { in: [] } });
  });
});
