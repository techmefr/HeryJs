import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { readDefinition } from './module-discovery';
import { compatibilityProblem } from './module-compatibility';
import { scaffoldModule, scaffoldProblem } from './module-scaffold';
import { KERNEL_VERSION } from './kernel-version';

describe('what may be scaffolded', () => {
  let packagesDir: string;

  beforeEach(() => {
    packagesDir = mkdtempSync(path.join(tmpdir(), 'hery-packages-'));
  });

  it('accepts a kebab-case name nothing else claims', () => {
    expect(scaffoldProblem('audit-trail', packagesDir)).toBeUndefined();
    expect(scaffoldProblem('audit', packagesDir)).toBeUndefined();
    expect(scaffoldProblem('s3', packagesDir)).toBeUndefined();
  });

  // The name becomes a directory, a package name, an npm id and the word typed
  // on the command line, so it is constrained to the one shape all four accept
  // rather than sanitised differently by each.
  it.each(['AuditTrail', 'audit_trail', 'audit trail', '-audit', 'audit-', ''])(
    'refuses "%s"',
    (name) => {
      expect(scaffoldProblem(name, packagesDir)).toContain('kebab-case');
    },
  );

  it('refuses a name whose package directory is already there', () => {
    mkdirSync(path.join(packagesDir, 'audit-trail'));

    expect(scaffoldProblem('audit-trail', packagesDir)).toBe(
      'packages/audit-trail already exists',
    );
  });

  // A community module can hold a name no directory here reveals, and two
  // modules answering to one id is an install that picks whichever the loader
  // saw first.
  it('refuses a name an installable module already answers to', () => {
    expect(scaffoldProblem('mail', packagesDir, ['mail'])).toBe(
      'a module named "mail" is already installable here',
    );
  });
});

describe('what is scaffolded', () => {
  let repoRoot: string;
  let packagesDir: string;
  let written: string[];

  function read(relative: string): string {
    return readFileSync(path.join(repoRoot, relative), 'utf8');
  }

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(tmpdir(), 'hery-root-'));
    packagesDir = path.join(repoRoot, 'packages');
    mkdirSync(packagesDir);
    writeFileSync(
      path.join(repoRoot, 'package.json'),
      JSON.stringify({
        devDependencies: { '@nestjs/common': '^12.0.1', typescript: '^6.0.3' },
      }),
    );

    written = scaffoldModule('audit-trail', packagesDir, repoRoot);
  });

  it('reports every file it wrote, relative to the project', () => {
    expect(written).toEqual([
      'packages/audit-trail/package.json',
      'packages/audit-trail/tsconfig.json',
      'packages/audit-trail/tsconfig.build.json',
      'packages/audit-trail/README.md',
      'packages/audit-trail/src/module.ts',
      'packages/audit-trail/src/runtime/audit-trail.service.ts',
      'packages/audit-trail/src/runtime/audit-trail.module.ts',
      'packages/audit-trail/src/runtime/audit-trail.service.spec.ts',
    ]);
  });

  /**
   * The loader requires the entry, and it loads with nothing around it: the
   * scaffolded definition's only import of HeryJs is `import type`, which the
   * compiler erases. That is the contract the whole channel rests on -- a
   * published module has no runtime dependency on the framework -- and this
   * fake project has no `heryjs` to resolve, which is what proves it.
   */
  it('produces a module the loader accepts', () => {
    const packageDir = path.join(repoRoot, 'packages/audit-trail');

    const loaded = readDefinition(
      path.join(packageDir, 'src/module.ts'),
      'official',
      packageDir,
      'audit-trail',
    );

    expect(loaded?.name).toBe('audit-trail');
    expect(loaded?.dest).toBe('src/modules/audit-trail');
  });

  // The destination it lands at is the derived one, so the definition says
  // nothing about it -- declaring the default is refused, not tolerated.
  it('leaves the destination out of the definition', () => {
    expect(read('packages/audit-trail/src/module.ts')).not.toContain('dest:');
  });

  it('declares a compatibility this kernel satisfies', () => {
    const declared = /compatibility: '([^']+)'/.exec(
      read('packages/audit-trail/src/module.ts'),
    )?.[1];

    expect(declared).toBeDefined();
    expect(compatibilityProblem(declared as string)).toBeUndefined();
  });

  // A kebab name that keeps its hyphen in a class name compiles to nothing,
  // and it is the one transformation the templates all depend on.
  it('turns the name into a class name', () => {
    expect(
      read('packages/audit-trail/src/runtime/audit-trail.module.ts'),
    ).toContain('export class AuditTrailModule');
    expect(
      read('packages/audit-trail/src/runtime/audit-trail.service.ts'),
    ).toContain('export class AuditTrailService');
  });

  /**
   * The whole published contract, on the first run rather than on publish
   * day. A scaffold that wrote only the marker produced a package that worked
   * in the directory it was written in and nowhere else: no `main`, so the
   * loader had nothing to require, and no `files`, so what reached npm was
   * whatever npm chose not to strip.
   */
  it('declares what a published module has to declare', () => {
    const pkg = JSON.parse(read('packages/audit-trail/package.json')) as {
      name: string;
      heryjs: { module: boolean };
      main: string;
      types: string;
      files: string[];
      scripts: Record<string, string>;
      peerDependencies: Record<string, string>;
    };

    expect(pkg.name).toBe('audit-trail');
    expect(pkg.heryjs.module).toBe(true);
    expect(pkg.main).toBe('dist/module.js');
    expect(pkg.types).toBe('dist/module.d.ts');
    expect(pkg.files).toEqual(['dist', 'src/runtime']);
    expect(pkg.scripts.prepack).toBe('pnpm run build');
    expect(pkg.peerDependencies['@nestjs/common']).toBeDefined();
  });

  /**
   * A stale `dist` is not merely old output, it is an input: `@types/node`
   * imports `"stream"`, and tsc resolves that specifier to a workspace package
   * of that name once it has a declaration file to find -- so the module named
   * `stream` failed its own second build with "would overwrite input file".
   * Cleaning first is what makes a build depend on nothing but its sources.
   */
  it('builds from a clean dist', () => {
    const pkg = JSON.parse(read('packages/audit-trail/package.json')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts.build).toBe('rm -rf dist && tsc -p tsconfig.build.json');
  });

  // Pinned from the project rather than written into the template, so a
  // scaffolded module typechecks against the same NestJS the kernel does.
  it('pins its dependencies to the ranges the project resolves', () => {
    const pkg = JSON.parse(read('packages/audit-trail/package.json')) as {
      devDependencies: Record<string, string>;
    };

    expect(pkg.devDependencies['@nestjs/common']).toBe('^12.0.1');
    expect(pkg.devDependencies.typescript).toBe('^6.0.3');
  });

  /**
   * The build resolves the contract through the package, the way a third
   * party's does, so a module's own build proves the published declaration is
   * usable. Inside this repository that package is the workspace root; the
   * scaffolded manifest says which of the two it is looking at.
   */
  it('depends on the kernel release when it is scaffolded outside this repository', () => {
    const pkg = JSON.parse(read('packages/audit-trail/package.json')) as {
      devDependencies: Record<string, string>;
    };

    expect(pkg.devDependencies.heryjs).toBe(`^${KERNEL_VERSION}`);
  });

  // Not decoration: copyRuntime copies it into the project with the code, and
  // the installing project's own suite is what runs it.
  it('ships a spec under src/runtime', () => {
    expect(
      read('packages/audit-trail/src/runtime/audit-trail.service.spec.ts'),
    ).toContain("describe('AuditTrailService'");
  });

  it('points the runtime at the kernel through the rewritable specifier', () => {
    expect(read('packages/audit-trail/tsconfig.json')).toContain(
      '"#kernel/*": ["../../src/technical/*"]',
    );
  });

  // Before the directory exists, because the day an author adds integration
  // tests is the day their typed lint rules start reporting every file in it
  // as outside the project -- and module:validate refuses that shape.
  it('includes a test directory the author has not created yet', () => {
    expect(read('packages/audit-trail/tsconfig.json')).toContain(
      '"include": ["src", "test"]',
    );
  });
});
