import { describe, expect, it } from 'vitest';
import { describeShare, grantBody, shareRoute, sharesRoute } from './shares';

describe('share requests', () => {
  it('addresses the shares of a record, escaping the id', () => {
    expect(sharesRoute('/snippets', 'a/b')).toBe('/snippets/a%2Fb/shares');
    expect(shareRoute('/snippets', 'r1', 's 1')).toBe(
      '/snippets/r1/shares/s%201',
    );
  });

  it('trims the grantee it sends', () => {
    expect(grantBody('user', ' u1 ', 'read')).toEqual({
      granteeType: 'user',
      granteeId: 'u1',
      access: 'read',
    });
  });

  it('says who can do what, naming a team when it is known', () => {
    const teams = [{ id: 't1', name: 'Editors' }];

    expect(
      describeShare(
        { id: 's', granteeType: 'team', granteeId: 't1', access: 'write' },
        teams,
      ),
    ).toBe('Team Editors can read and edit');
    expect(
      describeShare({
        id: 's',
        granteeType: 'user',
        granteeId: 'u1',
        access: 'read',
      }),
    ).toBe('User u1 can read');
  });
});
