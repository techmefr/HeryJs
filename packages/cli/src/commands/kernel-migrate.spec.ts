import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { registerKernelMigrateCommand } from './kernel-migrate';

jest.mock('../lib/framework-root', () => ({
  findFrameworkRoot: () => undefined,
  frameworkRoot: () => {
    throw new Error('Could not find the HeryJs payload');
  },
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

describe('hery kernel:migrate in a project that still carries a copy of the CLI', () => {
  let root: string;

  const shippedFile = path.join('cli', 'lib', 'naming.ts');

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-copied-cli-'));
    mkdirSync(path.join(root, 'cli', 'lib'), { recursive: true });
    mkdirSync(path.join(root, 'packages', 'two-factor'), { recursive: true });
    mkdirSync(path.join(root, 'prisma', 'schema', '_hery'), {
      recursive: true,
    });
    copyFileSync(
      path.join(__dirname, '..', 'lib', 'naming.ts'),
      path.join(root, shippedFile),
    );
    writeFileSync(
      path.join(root, 'prisma', 'schema', '_hery', 'core.prisma'),
      'model User {\n  id String @id\n}\n',
    );
    writeFileSync(
      path.join(root, 'tsconfig.json'),
      '{\n  "compilerOptions": {\n    "paths": {\n      "heryjs": ["./cli/module-contract.ts"]\n    }\n  }\n}\n',
    );
    writeFileSync(
      path.join(root, 'packages', 'two-factor', 'tsconfig.json'),
      '{\n  "compilerOptions": {\n    "paths": {\n      "heryjs": [\n        "../../cli/module-contract.ts"\n      ]\n    }\n  }\n}\n',
    );
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'my-app',
        scripts: {
          hery: 'NODE_OPTIONS="--conditions=development" ts-node cli/hery.ts',
          'lint:hery':
            'NODE_OPTIONS="--conditions=development" ts-node cli/hery.ts lint --min-score 100',
          check: 'pnpm hery check',
        },
      }),
    );
    jest.spyOn(process, 'cwd').mockReturnValue(root);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.exitCode = undefined;
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  async function migrate(): Promise<void> {
    const program = new Command();
    registerKernelMigrateCommand(program);
    await program.parseAsync(['node', 'hery', 'kernel:migrate']);
  }

  it('removes the copy when every file is one HeryJs shipped', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await migrate();

    expect(existsSync(path.join(root, 'cli'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('runs the scripts from the installed @heryjs/cli', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await migrate();

    const manifest = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(manifest.scripts).toEqual({
      hery: 'NODE_OPTIONS="--conditions=development" hery',
      'lint:hery':
        'NODE_OPTIONS="--conditions=development" hery lint --min-score 100',
      check: 'pnpm hery check',
    });
  });

  it('types module contracts against the installed @heryjs/cli', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await migrate();

    expect(readFileSync(path.join(root, 'tsconfig.json'), 'utf8')).toContain(
      '"heryjs": ["./node_modules/@heryjs/cli/dist/module-contract.d.ts"]',
    );
    expect(
      readFileSync(
        path.join(root, 'packages', 'two-factor', 'tsconfig.json'),
        'utf8',
      ),
    ).toContain('"../../node_modules/@heryjs/cli/dist/module-contract.d.ts"');
  });

  it('runs the Prisma registry generator from the installed @heryjs/cli', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const schema = path.join(root, 'prisma', 'schema', '_hery', 'core.prisma');
    writeFileSync(
      schema,
      'generator hery {\n  provider = "node cli/prisma-registry-generator.ts"\n}\n\nmodel User {\n  id String @id\n}\n',
    );

    await migrate();

    expect(readFileSync(schema, 'utf8')).toContain(
      'provider = "node node_modules/@heryjs/cli/bin/prisma-registry-generator.js"',
    );
  });

  it('keeps a file the project changed, and says so', async () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    writeFileSync(path.join(root, 'cli', 'hery.ts'), '// my own command\n');

    await migrate();

    expect(existsSync(path.join(root, shippedFile))).toBe(false);
    expect(readFileSync(path.join(root, 'cli', 'hery.ts'), 'utf8')).toBe(
      '// my own command\n',
    );
    expect(warn.mock.calls.flat().join('\n')).toContain('cli/hery.ts');
  });

  it('writes nothing with --check, and fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const program = new Command();
    registerKernelMigrateCommand(program);

    await program.parseAsync(['node', 'hery', 'kernel:migrate', '--check']);

    expect(existsSync(path.join(root, shippedFile))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});
