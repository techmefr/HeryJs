import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  isInstalledPackage,
  moduleCopyState,
  siblingPackageSpec,
  withModulePackages,
  withPackagedModuleMapper,
} from './module-packages';
import { copyRuntime } from './runtime-copy';

describe('a generated project consuming its modules as packages', () => {
  it('installs each workspace module from where the framework keeps it', () => {
    const manifest = withModulePackages(
      {
        dependencies: {
          '@heryjs/core': 'workspace:*',
          '@heryjs/sso': 'workspace:*',
          '@heryjs/two-factor': 'workspace:*',
          zod: '^4.5.4',
        },
        imports: { '#modules/*': '@heryjs/*' },
      },
      (name) => `file:/framework/packages/${name}`,
    );

    expect(manifest.dependencies).toEqual({
      '@heryjs/core': 'workspace:*',
      '@heryjs/sso': 'file:/framework/packages/sso',
      '@heryjs/two-factor': 'file:/framework/packages/two-factor',
      zod: '^4.5.4',
    });
    expect(manifest.imports['#modules/*']).toBe('@heryjs/*');
  });

  it('resolves #modules/ through the installed packages in jest', () => {
    expect(
      withPackagedModuleMapper({
        '^@heryjs/(?!core/|cli/)([^/]+)/hery$':
          '<rootDir>/packages/$1/src/runtime/$1.hery',
        '^@heryjs/(?!core/|cli/)([^/]+)/(.*)$':
          '<rootDir>/packages/$1/src/runtime/$2',
        '^#modules/([^/]+)/(.*)$': '<rootDir>/packages/$1/src/runtime/$2',
        '^#functional/(.*)$': '<rootDir>/src/functional/$1',
      }),
    ).toEqual({
      '^#modules/([^/]+)/(.*)$': '@heryjs/$1/$2',
      '^#functional/(.*)$': '<rootDir>/src/functional/$1',
    });
  });
});

describe('the copy of a module an older project carries', () => {
  let root: string;
  let runtime: string;
  const dest = path.join('src', 'modules', 'sso');

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-module-copy-'));
    runtime = path.join(root, 'package', 'src', 'runtime');
    mkdirSync(path.join(runtime, 'auth'), { recursive: true });
    writeFileSync(
      path.join(runtime, 'sso.module.ts'),
      "import { env } from '#kernel/config/env';\n",
    );
    writeFileSync(path.join(runtime, 'auth', 'guard.ts'), 'export {};\n');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is absent when the module was never copied', () => {
    expect(moduleCopyState(root, dest, runtime)).toEqual({ copied: false });
  });

  it('is the package runtime, untouched, as the install copied it', () => {
    copyRuntime(runtime, path.join(root, dest), { quiet: true });

    expect(moduleCopyState(root, dest, runtime)).toEqual({
      copied: true,
      modified: [],
    });
  });

  it('names every file the project changed or added', () => {
    copyRuntime(runtime, path.join(root, dest), { quiet: true });
    appendFileSync(path.join(root, dest, 'auth', 'guard.ts'), '// mine\n');
    writeFileSync(path.join(root, dest, 'extra.ts'), 'export {};\n');

    expect(moduleCopyState(root, dest, runtime)).toEqual({
      copied: true,
      modified: [
        path.join(dest, 'auth', 'guard.ts'),
        path.join(dest, 'extra.ts'),
      ],
    });
  });
});

describe('adding a module package next to the kernel', () => {
  it('takes it from beside a local kernel', () => {
    expect(siblingPackageSpec('file:/framework/packages/core', 'sso')).toBe(
      `file:${path.join('/framework/packages', 'sso')}`,
    );
  });

  it('takes the same range as a published kernel', () => {
    expect(siblingPackageSpec('0.1.0', 'sso')).toBe('0.1.0');
  });

  it('tells an installed package from a workspace one', () => {
    expect(isInstalledPackage('/p/node_modules/@heryjs/sso')).toBe(true);
    expect(isInstalledPackage('/framework/packages/sso')).toBe(false);
  });
});
