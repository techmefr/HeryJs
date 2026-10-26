import {
  additiveMigrationProblems,
  destructiveStatements,
  isBreakingCommit,
  manifestTypeProblems,
  peerRangeProblems,
  versionProblems,
} from './release-rules';

describe('one version for every package', () => {
  it('accepts packages at the root version', () => {
    expect(
      versionProblems('0.1.0', [
        { name: 'packages/core', version: '0.1.0' },
        { name: 'packages/sso', version: '0.1.0' },
      ]),
    ).toEqual([]);
  });

  it('names a package at another version', () => {
    expect(
      versionProblems('0.1.0', [{ name: 'packages/sso', version: '0.2.0' }]),
    ).toEqual(['packages/sso is at 0.2.0, the release is 0.1.0']);
  });
});

describe('the peers between HeryJs packages', () => {
  it('pins @heryjs peers to the version published with them', () => {
    expect(
      peerRangeProblems('packages/sso', {
        '@heryjs/core': 'workspace:*',
        '@nestjs/common': '^12.0.0',
      }),
    ).toEqual([]);
  });

  it('holds the peer on the heryjs payload to the same version', () => {
    expect(
      peerRangeProblems('packages/sso', { heryjs: 'workspace:^' }),
    ).toEqual([
      'packages/sso peers on heryjs@workspace:^, not workspace:* (the same version)',
    ]);
  });

  it('refuses a range that lets another release of the kernel in', () => {
    expect(
      peerRangeProblems('packages/sso', { '@heryjs/core': 'workspace:^' }),
    ).toEqual([
      'packages/sso peers on @heryjs/core@workspace:^, not workspace:* (the same version)',
    ]);
  });
});

describe('the module system a package declares', () => {
  it('accepts commonjs and module', () => {
    expect(manifestTypeProblems('packages/core', { type: 'commonjs' })).toEqual(
      [],
    );
    expect(manifestTypeProblems('packages/core', { type: 'module' })).toEqual(
      [],
    );
  });

  it('refuses a manifest that leaves it to the default', () => {
    expect(manifestTypeProblems('packages/core', {})).toEqual([
      'packages/core has no "type" field',
    ]);
  });
});

describe('kernel migrations stay additive', () => {
  it('finds the statements that drop or rename', () => {
    expect(
      destructiveStatements(
        [
          'CREATE TABLE "Note" ("id" TEXT);',
          'ALTER TABLE "User" DROP COLUMN "legacy";',
          'ALTER TABLE "User" RENAME COLUMN "a" TO "b";',
          'DROP TABLE "Old";',
          'DROP INDEX "User_email_idx";',
          '-- DROP TABLE "Commented";',
        ].join('\n'),
      ),
    ).toEqual([
      'ALTER TABLE "User" DROP COLUMN "legacy";',
      'ALTER TABLE "User" RENAME COLUMN "a" TO "b";',
      'DROP TABLE "Old";',
    ]);
  });

  it('tells a breaking commit from the rest', () => {
    expect(isBreakingCommit('feat!: drop the legacy column')).toBe(true);
    expect(isBreakingCommit('feat(core)!: drop it')).toBe(true);
    expect(isBreakingCommit('feat: x\n\nBREAKING CHANGE: y')).toBe(true);
    expect(isBreakingCommit('fix(core): keep it')).toBe(false);
  });

  const dropping = {
    name: '20261101000000_drop_legacy',
    sql: 'ALTER TABLE "User" DROP COLUMN "legacy";',
  };

  it('refuses a destructive migration outside a breaking change', () => {
    expect(additiveMigrationProblems([dropping], false)).toEqual([
      '20261101000000_drop_legacy drops or renames outside a feat! commit: ALTER TABLE "User" DROP COLUMN "legacy";',
    ]);
  });

  it('lets a breaking change carry it', () => {
    expect(additiveMigrationProblems([dropping], true)).toEqual([]);
  });
});
