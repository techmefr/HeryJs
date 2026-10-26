import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { registerKernelMigrateCommand } from './kernel-migrate';

jest.mock('../lib/framework-root', () => ({
  frameworkRoot: () => process.cwd(),
}));

describe('hery kernel:migrate in a project generated on the package', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-kernel-migrate-'));
    mkdirSync(path.join(root, 'cli'), { recursive: true });
    mkdirSync(path.join(root, 'packages'), { recursive: true });
    mkdirSync(path.join(root, 'prisma', 'schema', '_hery'), {
      recursive: true,
    });
    writeFileSync(path.join(root, 'cli', 'hery.ts'), '');
    writeFileSync(
      path.join(root, 'prisma', 'schema', '_hery', 'core.prisma'),
      'model User {\n  id String @id\n}\n',
    );
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: {} }),
    );
    jest.spyOn(process, 'cwd').mockReturnValue(root);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.exitCode = undefined;
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('runs from the CLI the project carries, which has no packages/core', async () => {
    const program = new Command();
    registerKernelMigrateCommand(program);

    await expect(
      program.parseAsync(['node', 'hery', 'kernel:migrate', '--check']),
    ).resolves.toBeDefined();
  });
});
