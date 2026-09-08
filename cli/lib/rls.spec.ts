import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEveryMigration } from './rls';

function migrationsWith(...names: string[]): string {
  const dir = path.join(
    mkdtempSync(path.join(tmpdir(), 'hery-rls-')),
    'migrations',
  );

  names.forEach((name) => mkdirSync(path.join(dir, name), { recursive: true }));

  return dir;
}

/**
 * Prisma applies migrations in directory-name order, and the policy migration
 * is written straight after the one that creates the tables it locks down --
 * within the same second, on a project's first migrate. `enable_rls_team`
 * sorts before `init`, so the policies ran against tables Postgres did not
 * have yet and the first migration of every scaffolded project failed.
 */
describe('the timestamp a policy migration takes', () => {
  it('keeps its own when nothing was written that second', () => {
    const dir = migrationsWith('20260908164800_init');

    expect(afterEveryMigration(dir, '20260908164840')).toBe('20260908164840');
  });

  it('steps past a migration written in the same second', () => {
    const dir = migrationsWith('20260908164840_init');

    expect(afterEveryMigration(dir, '20260908164840')).toBe('20260908164841');
  });

  it('steps past the latest one, not the first', () => {
    const dir = migrationsWith(
      '20260101000000_init',
      '20260908164840_add_teams',
      'migration_lock.toml',
    );

    expect(afterEveryMigration(dir, '20260908164839')).toBe('20260908164841');
  });

  // The second, minute and hour all roll over: naive arithmetic on the digits
  // would have produced 20261231235960.
  it('rolls the clock over rather than the digits', () => {
    const dir = migrationsWith('20261231235959_init');

    expect(afterEveryMigration(dir, '20261231235959')).toBe('20270101000000');
  });

  it('takes its own timestamp when the project has no migrations yet', () => {
    const dir = path.join(
      mkdtempSync(path.join(tmpdir(), 'hery-rls-')),
      'migrations',
    );

    expect(afterEveryMigration(dir, '20260908164840')).toBe('20260908164840');
  });
});
