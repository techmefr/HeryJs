import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { appliedMigrations, historyWithoutLast } from './migrate-down';

function fakeProject(names: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'hery-migrate-spec-'));
  const migrations = path.join(root, 'prisma', 'migrations');

  mkdirSync(migrations, { recursive: true });

  for (const name of names) {
    mkdirSync(path.join(migrations, name));
    writeFileSync(path.join(migrations, name, 'migration.sql'), '-- sql\n');
  }

  // Prisma keeps a lock file beside the migration directories; it is not a
  // migration and must never be counted as the last one.
  writeFileSync(
    path.join(migrations, 'migration_lock.toml'),
    'provider = "postgresql"\n',
  );

  return root;
}

describe('migrate:down', () => {
  const roots: string[] = [];

  afterAll(() => {
    roots.forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  function project(names: string[]): string {
    const root = fakeProject(names);
    roots.push(root);
    return root;
  }

  it('orders migrations by their timestamp prefix, not by readdir order', () => {
    const root = project([
      '20260102_second',
      '20260101_first',
      '20260103_third',
    ]);

    expect(appliedMigrations(root)).toEqual([
      '20260101_first',
      '20260102_second',
      '20260103_third',
    ]);
  });

  it('ignores the lock file sitting beside the migrations', () => {
    const root = project(['20260101_first']);

    expect(appliedMigrations(root)).toEqual(['20260101_first']);
  });

  /**
   * The copy is what makes reverting safe to attempt: Prisma reads a history
   * from disk, so the state before the last migration has to exist as a
   * directory that genuinely lacks it. Doing that in place would leave a
   * project one crash away from a history missing a migration it has applied.
   */
  it('builds the earlier history in a copy, leaving the real one untouched', () => {
    const root = project(['20260101_first', '20260102_second']);
    const target = historyWithoutLast(root, appliedMigrations(root));

    expect(readdirSync(target)).toEqual(
      expect.arrayContaining(['20260101_first', 'migration_lock.toml']),
    );
    expect(readdirSync(target)).not.toContain('20260102_second');
    expect(appliedMigrations(root)).toEqual([
      '20260101_first',
      '20260102_second',
    ]);

    rmSync(path.dirname(target), { recursive: true, force: true });
  });
});
