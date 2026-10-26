import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { COPY_ENTRIES, projectManifest } from '../commands/new';
import { registerKernelMigrateCommand } from '../commands/kernel-migrate';
import {
  adoptKernelPackage,
  kernelDependency,
  modifiedKernelFiles,
  rewriteAppKernelImports,
  rewriteRelativeKernelImports,
  withKernelPackage,
  withoutKernelDependency,
} from './kernel-dependency';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// The last commit whose "hery new" copied src/technical (as in ci.yml).
const LAST_COPYING_COMMIT = '1c55ed42d81c91bb84feb9e619254f3a6cc0628a';

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(path.join(...segments), 'utf8')) as T;
}

const REPO_MANIFEST = readJson<Record<string, unknown>>(
  REPO_ROOT,
  'package.json',
);

interface Manifest {
  dependencies: Record<string, string>;
  imports: Record<string, unknown>;
  scripts: Record<string, string>;
  jest: { moduleNameMapper: Record<string, string> };
}

describe('the @heryjs/core manifest', () => {
  const core = readJson<{
    files: string[];
    exports: Record<string, unknown>;
  }>(REPO_ROOT, 'packages', 'core', 'package.json');

  it('publishes dist and the kernel schema, not the symlinks into this repository', () => {
    expect(core.files).toEqual(['dist', 'prisma']);
    expect(core.files).not.toContain('src');
  });

  it('points at sources only under its own condition, never under development', () => {
    const conditions = Object.values(core.exports).flatMap((target) =>
      typeof target === 'string' ? [] : Object.keys(target as object),
    );

    expect(conditions).not.toContain('development');
    expect(new Set(conditions)).toEqual(
      new Set(['heryjs-source', 'types', 'default']),
    );
    Object.values(core.exports)
      .filter((target) => typeof target !== 'string')
      .forEach((target) => {
        const { default: fallback, types } = target as Record<string, string>;

        expect(fallback).toMatch(/^\.\/dist\/.+\.js$/);
        expect(types).toMatch(/^\.\/dist\/.+\.d\.ts$/);
      });
  });
});

describe('what hery new copies', () => {
  it('copies no kernel, only the test support that boots the app', () => {
    expect(COPY_ENTRIES).not.toContain('src/technical');
    expect(COPY_ENTRIES).not.toContain('src/devtools');
    expect(
      COPY_ENTRIES.filter((entry) => entry.startsWith('src/devtools')),
    ).toEqual(['src/devtools/testing', 'src/devtools/test-support.ts']);
  });
});

describe('a project manifest reading the kernel from the package', () => {
  const dependency = 'file:/somewhere/packages/core';
  const manifest = () =>
    withKernelPackage(
      projectManifest(REPO_MANIFEST, 'my-app') as unknown as Manifest,
      dependency,
    );

  it('depends on @heryjs/core through the one line a project changes', () => {
    expect(
      (REPO_MANIFEST.dependencies as Record<string, string>)['@heryjs/core'],
    ).toBe('workspace:*');
    expect(manifest().dependencies['@heryjs/core']).toBe(dependency);
  });

  it('reaches kernel internals through the package, not a folder', () => {
    expect(manifest().imports['#technical/*']).toBe('@heryjs/core/technical/*');
    expect(manifest().jest.moduleNameMapper).toMatchObject({
      '^#technical/(.*)$': '@heryjs/core/technical/$1',
      '^#kernel/(.*)$': '@heryjs/core/technical/$1',
    });
    expect(
      Object.keys(manifest().jest.moduleNameMapper).filter((pattern) =>
        pattern.startsWith('^@heryjs/core'),
      ),
    ).toEqual([]);
    expect(
      Object.values(manifest().jest.moduleNameMapper).filter((target) =>
        target.includes('src/technical'),
      ),
    ).toEqual([]);
  });

  it('keeps no script that builds the kernel or selects its sources', () => {
    const scripts = Object.entries(manifest().scripts);

    expect(
      scripts.filter(([, command]) => /build:core|heryjs-source/.test(command)),
    ).toEqual([]);
    expect(manifest().scripts.hery).toContain('--conditions=development');
  });

  it('leaves the manifest it was given alone', () => {
    const source = projectManifest(REPO_MANIFEST, 'my-app');
    const before = JSON.stringify(source);

    withKernelPackage(source as unknown as Manifest, dependency);

    expect(JSON.stringify(source)).toBe(before);
  });

  it('installs from the package this checkout builds', () => {
    expect(kernelDependency('/repo')).toBe(
      `file:${path.join('/repo', 'packages', 'core')}`,
    );
  });
});

describe('a module manifest once the kernel is a dependency', () => {
  it('drops the workspace ranges on @heryjs/core and keeps a real one', () => {
    const mail = readJson<Record<string, Record<string, string>>>(
      REPO_ROOT,
      'packages',
      'mail',
      'package.json',
    );

    expect(mail.peerDependencies?.['@heryjs/core']).toBe('workspace:*');

    const rewritten = withoutKernelDependency(mail) as Record<
      string,
      Record<string, string>
    >;

    expect(rewritten.peerDependencies?.['@heryjs/core']).toBeUndefined();
    expect(rewritten.devDependencies?.['@heryjs/core']).toBeUndefined();
    expect(
      (
        withoutKernelDependency({
          peerDependencies: { '@heryjs/core': '^0.1.0' },
        }) as Record<string, Record<string, string>>
      ).peerDependencies,
    ).toEqual({ '@heryjs/core': '^0.1.0' });
  });
});

describe('the imports a project rewrites', () => {
  it('sends a relative import of src/technical to the package subpath', () => {
    expect(
      rewriteRelativeKernelImports(
        "import '../src/technical/config/load-env';\nimport type { A } from './src/technical/a';\nconst b = require('../../../../src/technical/b');",
      ),
    ).toBe(
      "import '@heryjs/core/technical/config/load-env';\nimport type { A } from '@heryjs/core/technical/a';\nconst b = require('@heryjs/core/technical/b');",
    );
  });

  it('leaves a tsconfig path written in a string alone', () => {
    const source = `paths: { '#kernel/*': ['../../src/technical/*'] }`;

    expect(rewriteRelativeKernelImports(source)).toBe(source);
  });

  it('sends the public folders to the public entries', () => {
    expect(
      rewriteAppKernelImports(
        "import { a } from '#technical/public/auth';\nimport { b } from '#devtools/public';\nimport { c } from '#technical/auth/session.guard';",
      ),
    ).toBe(
      "import { a } from '@heryjs/core/auth';\nimport { b } from '@heryjs/core/devtools';\nimport { c } from '#technical/auth/session.guard';",
    );
  });
});

describe('a project that still carries a copy of the kernel', () => {
  let root: string;
  const OWN_FILE = path.join('src', 'functional', 'mine.ts');

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-kernel-copy-'));
    cpSync(
      path.join(REPO_ROOT, 'src', 'technical'),
      path.join(root, 'src', 'technical'),
      { recursive: true },
    );
    cpSync(
      path.join(REPO_ROOT, 'src', 'devtools'),
      path.join(root, 'src', 'devtools'),
      { recursive: true },
    );
    rmSync(
      path.join(
        root,
        'src',
        'technical',
        'introspection',
        'introspection.spec.ts',
      ),
    );
    cpSync(
      path.join(REPO_ROOT, 'src', 'functional'),
      path.join(root, 'src', 'functional'),
      {
        recursive: true,
      },
    );
    writeFileSync(path.join(root, OWN_FILE), "export const mine = 'kept';\n");
    writeFileSync(
      path.join(root, 'package.json'),
      `${JSON.stringify(projectManifest(REPO_MANIFEST, 'old-app'), null, 2)}\n`,
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is unmodified when every file it kept is the shipped one', () => {
    expect(modifiedKernelFiles(root, REPO_ROOT)).toEqual([]);
  });

  it('names the files that differ and the ones the kernel does not have', () => {
    appendFileSync(
      path.join(root, 'src', 'technical', 'config', 'env.ts'),
      '// mine\n',
    );
    writeFileSync(path.join(root, 'src', 'technical', 'extra.ts'), '');

    expect(modifiedKernelFiles(root, REPO_ROOT)).toEqual([
      path.join('src', 'technical', 'config', 'env.ts'),
      path.join('src', 'technical', 'extra.ts'),
    ]);
  });

  it('accepts a kernel file as an earlier release shipped it', () => {
    writeFileSync(
      path.join(root, 'src', 'technical', 'public', 'config.ts'),
      readFileSync(
        path.join(REPO_ROOT, 'src', 'technical', 'public', 'config.ts'),
        'utf8',
      ).replace('  HeryConfigModuleEntry,\n', ''),
    );

    expect(modifiedKernelFiles(root, REPO_ROOT)).toEqual([]);
  });

  it('accepts a file that is a version an older release shipped', () => {
    const file = path.join('src', 'technical', 'config', 'env.ts');
    const older = '// the kernel as an older release shipped it\n';
    writeFileSync(path.join(root, file), older);

    expect(
      modifiedKernelFiles(root, REPO_ROOT, {
        'src/technical/config/env.ts': [
          createHash('sha256').update(older).digest('hex'),
        ],
      }),
    ).toEqual([]);
  });

  it('still refuses a file that matches no version ever shipped', () => {
    const file = path.join('src', 'technical', 'config', 'env.ts');
    writeFileSync(path.join(root, file), '// a local change\n');

    expect(
      modifiedKernelFiles(root, REPO_ROOT, {
        'src/technical/config/env.ts': [
          createHash('sha256').update('// another version\n').digest('hex'),
        ],
      }),
    ).toEqual([file]);
  });

  it('accepts the kernel the last copying release shipped, though the current one changed', () => {
    const generated = mkdtempSync(path.join(tmpdir(), 'hery-kernel-old-'));

    try {
      const archive = execFileSync(
        'git',
        ['archive', LAST_COPYING_COMMIT, 'src/technical', 'src/devtools'],
        { cwd: REPO_ROOT, maxBuffer: 256 * 1024 * 1024 },
      );
      execFileSync('tar', ['-x', '-C', generated], { input: archive });

      expect(modifiedKernelFiles(generated, REPO_ROOT)).toEqual([]);

      appendFileSync(
        path.join(generated, 'src', 'technical', 'config', 'env.ts'),
        '// a local change\n',
      );

      expect(modifiedKernelFiles(generated, REPO_ROOT)).toEqual([
        path.join('src', 'technical', 'config', 'env.ts'),
      ]);
    } finally {
      rmSync(generated, { recursive: true, force: true });
    }
  });

  it('ignores the test support it keeps', () => {
    appendFileSync(
      path.join(root, 'src', 'devtools', 'testing', 'wait-for.ts'),
      '// mine\n',
    );

    expect(modifiedKernelFiles(root, REPO_ROOT)).toEqual([]);
  });

  it('moves onto the package and keeps the files that are its own', () => {
    adoptKernelPackage(root, REPO_ROOT, { write: true });

    expect(existsSync(path.join(root, 'src', 'technical'))).toBe(false);
    expect(existsSync(path.join(root, 'src', 'devtools', 'public.ts'))).toBe(
      false,
    );
    expect(
      existsSync(path.join(root, 'src', 'devtools', 'test-support.ts')),
    ).toBe(true);
    expect(
      existsSync(path.join(root, 'src', 'devtools', 'testing', 'wait-for.ts')),
    ).toBe(true);
    expect(readFileSync(path.join(root, OWN_FILE), 'utf8')).toBe(
      "export const mine = 'kept';\n",
    );
    expect(
      readJson<Manifest>(root, 'package.json').dependencies['@heryjs/core'],
    ).toBe(kernelDependency(REPO_ROOT));
  });

  it('writes nothing when asked only to check', () => {
    const changed = adoptKernelPackage(root, REPO_ROOT, { write: false });

    expect(changed).toContain('package.json');
    expect(changed).toContain(
      path.join('src', 'technical', 'config', 'env.ts'),
    );
    expect(existsSync(path.join(root, 'src', 'technical'))).toBe(true);
  });

  describe('hery kernel:migrate', () => {
    const cwd = process.cwd();

    afterEach(() => {
      process.chdir(cwd);
      process.exitCode = undefined;
      jest.restoreAllMocks();
    });

    async function migrate(): Promise<string> {
      const errors: string[] = [];

      jest.spyOn(console, 'log').mockImplementation(() => undefined);
      jest
        .spyOn(console, 'error')
        .mockImplementation((line: string) => errors.push(line));
      process.chdir(root);

      const program = new Command();
      registerKernelMigrateCommand(program);
      await program.parseAsync(['node', 'hery', 'kernel:migrate']);

      return errors.join('\n');
    }

    it('stops on a modified kernel, names the file and changes nothing', async () => {
      const env = path.join(root, 'src', 'technical', 'config', 'env.ts');
      appendFileSync(env, '// mine\n');
      const manifest = readFileSync(path.join(root, 'package.json'), 'utf8');

      const errors = await migrate();

      expect(process.exitCode).toBe(1);
      expect(errors).toContain('is not the kernel this CLI ships');
      expect(errors).toContain(
        path.join('src', 'technical', 'config', 'env.ts'),
      );
      expect(errors).toContain('Nothing was changed');
      expect(existsSync(env)).toBe(true);
      expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(
        manifest,
      );
    });

    it('replaces an unmodified copy with the dependency', async () => {
      await migrate();

      expect(process.exitCode).toBeUndefined();
      expect(existsSync(path.join(root, 'src', 'technical'))).toBe(false);
      expect(existsSync(path.join(root, OWN_FILE))).toBe(true);
      expect(
        readJson<Manifest>(root, 'package.json').dependencies['@heryjs/core'],
      ).toBe(kernelDependency(REPO_ROOT));
    });
  });
});
