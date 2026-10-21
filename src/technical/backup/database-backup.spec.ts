import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  backupFileName,
  expiredBackups,
  listBackups,
  parseBackupName,
  resolveBackup,
} from './database-backup';
import type { BackupFile } from './database-backup';

function file(name: string): BackupFile {
  const parsed = parseBackupName(name) as NonNullable<
    ReturnType<typeof parseBackupName>
  >;

  return { name, ...parsed, sizeBytes: 1 };
}

describe('backup file names', () => {
  it('round-trips a database and a UTC timestamp', () => {
    const name = backupFileName('my_app', new Date('2026-10-21T03:04:05.678Z'));

    expect(name).toBe('my_app-20261021T030405Z.dump');
    expect(parseBackupName(name)).toEqual({
      database: 'my_app',
      createdAt: new Date('2026-10-21T03:04:05Z'),
    });
  });

  it('ignores files that are not backups', () => {
    expect(parseBackupName('notes.txt')).toBeNull();
    expect(parseBackupName('my_app-latest.dump')).toBeNull();
  });
});

describe('retention', () => {
  const files = [
    file('app-20261019T030000Z.dump'),
    file('app-20261021T030000Z.dump'),
    file('app-20261020T030000Z.dump'),
  ];

  it('expires everything but the newest dumps', () => {
    expect(expiredBackups(files, 2).map((entry) => entry.name)).toEqual([
      'app-20261019T030000Z.dump',
    ]);
    expect(expiredBackups(files, 3)).toEqual([]);
  });
});

describe('the backup directory', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'hery-backups-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('lists only this database dumps, newest first, and resolves "latest"', async () => {
    await writeFile(path.join(directory, 'app-20261019T030000Z.dump'), 'a');
    await writeFile(path.join(directory, 'app-20261021T030000Z.dump'), 'b');
    await writeFile(path.join(directory, 'other-20261022T030000Z.dump'), 'c');
    await writeFile(path.join(directory, 'README.txt'), 'd');

    const listed = await listBackups(directory, 'app');

    expect(listed.map((entry) => entry.name)).toEqual([
      'app-20261021T030000Z.dump',
      'app-20261019T030000Z.dump',
    ]);
    expect(await resolveBackup('latest', directory, 'app')).toBe(
      path.join(directory, 'app-20261021T030000Z.dump'),
    );
    expect(await resolveBackup('x.dump', directory, 'app')).toBe(
      path.join(directory, 'x.dump'),
    );
  });

  it('says there is nothing to restore rather than guessing', async () => {
    await expect(resolveBackup('latest', directory, 'app')).rejects.toThrow(
      /no backup of app/,
    );
    expect(await listBackups(path.join(directory, 'missing'))).toEqual([]);
  });
});
