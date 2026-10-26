import {
  branchDatabaseName,
  connectionUrlFor,
  isSynchronized,
  isValidBranchName,
  maintenanceUrl,
  migrationStatus,
  parseConnection,
  quoteIdentifier,
  resetVerdict,
} from './database';
import type { AppliedMigration } from './database';

const LOCAL_URL = 'postgresql://heryjs:heryjs@localhost:5432/heryjs';
const REMOTE_URL = 'postgresql://app:secret@db.example.com:5432/app';

function applied(
  name: string,
  overrides: Partial<AppliedMigration> = {},
): AppliedMigration {
  return { name, isFinished: true, isRolledBack: false, ...overrides };
}

describe('resetVerdict', () => {
  it('refuses in production, force or not', () => {
    for (const isForced of [false, true]) {
      const verdict = resetVerdict({
        nodeEnv: 'production',
        databaseUrl: LOCAL_URL,
        isForced,
      });

      expect(verdict.isAllowed).toBe(false);
      expect(verdict.reason).toContain('production');
    }
  });

  it('allows a local database outside production', () => {
    expect(
      resetVerdict({
        nodeEnv: 'development',
        databaseUrl: LOCAL_URL,
        isForced: false,
      }).isAllowed,
    ).toBe(true);
    expect(
      resetVerdict({
        nodeEnv: undefined,
        databaseUrl: LOCAL_URL,
        isForced: false,
      }).isAllowed,
    ).toBe(true);
  });

  it('refuses a remote database unless forced', () => {
    const refused = resetVerdict({
      nodeEnv: 'development',
      databaseUrl: REMOTE_URL,
      isForced: false,
    });

    expect(refused.isAllowed).toBe(false);
    expect(refused.reason).toContain('db.example.com');
    expect(
      resetVerdict({
        nodeEnv: 'development',
        databaseUrl: REMOTE_URL,
        isForced: true,
      }).isAllowed,
    ).toBe(true);
  });

  it('does not let force override the production refusal on a remote database', () => {
    expect(
      resetVerdict({
        nodeEnv: 'production',
        databaseUrl: REMOTE_URL,
        isForced: true,
      }).isAllowed,
    ).toBe(false);
  });
});

describe('connection helpers', () => {
  it('reads the host and database from the URL', () => {
    expect(parseConnection(LOCAL_URL)).toEqual({
      host: 'localhost',
      database: 'heryjs',
    });
  });

  it('rejects something that is not a URL', () => {
    expect(() => parseConnection('not a url')).toThrow(/not a valid/);
  });

  it('swaps only the database, keeping credentials and query', () => {
    expect(
      connectionUrlFor(
        'postgresql://u:p@localhost:5432/heryjs?schema=public',
        'other',
      ),
    ).toBe('postgresql://u:p@localhost:5432/other?schema=public');
  });

  it('connects to the maintenance database to create and drop branches', () => {
    expect(maintenanceUrl(LOCAL_URL)).toBe(
      'postgresql://heryjs:heryjs@localhost:5432/postgres',
    );
  });
});

describe('branch names', () => {
  it('accepts lowercase identifiers', () => {
    expect(isValidBranchName('feature_x1')).toBe(true);
  });

  it.each([
    '',
    'Feature',
    '1abc',
    'a-b',
    'a b',
    'x"; DROP DATABASE heryjs; --',
    'a'.repeat(32),
  ])('rejects %j', (name) => {
    expect(isValidBranchName(name)).toBe(false);
    expect(() => branchDatabaseName('heryjs', name)).toThrow();
  });

  it('derives the database from the source and the branch', () => {
    expect(branchDatabaseName('heryjs', 'try1')).toBe('heryjs_branch_try1');
  });

  it('refuses a name that overflows the Postgres identifier limit', () => {
    expect(() => branchDatabaseName('s'.repeat(40), 'a'.repeat(30))).toThrow(
      /63/,
    );
  });

  it('quotes an identifier, doubling embedded quotes', () => {
    expect(quoteIdentifier('a"b')).toBe('"a""b"');
  });
});

describe('migrationStatus', () => {
  it('marks what the database has finished as applied and the rest as pending', () => {
    const rows = migrationStatus(['001_a', '002_b'], [applied('001_a')]);

    expect(rows).toEqual([
      { name: '001_a', state: 'applied' },
      { name: '002_b', state: 'pending' },
    ]);
  });

  it('reports a migration that started and never finished as failed', () => {
    const rows = migrationStatus(
      ['001_a'],
      [applied('001_a', { isFinished: false })],
    );

    expect(rows).toEqual([{ name: '001_a', state: 'failed' }]);
  });

  it('treats a rolled back migration as pending again', () => {
    const rows = migrationStatus(
      ['001_a'],
      [applied('001_a', { isRolledBack: true })],
    );

    expect(rows).toEqual([{ name: '001_a', state: 'pending' }]);
  });

  it('reports a migration applied here but gone from disk as missing', () => {
    const rows = migrationStatus(
      ['002_b'],
      [applied('001_a'), applied('002_b')],
    );

    expect(rows).toEqual([
      { name: '001_a', state: 'missing' },
      { name: '002_b', state: 'applied' },
    ]);
  });

  it('is synchronized only when every row is applied', () => {
    expect(isSynchronized(migrationStatus(['001_a'], [applied('001_a')]))).toBe(
      true,
    );
    expect(isSynchronized(migrationStatus(['001_a'], []))).toBe(false);
    expect(isSynchronized([])).toBe(true);
  });
});
