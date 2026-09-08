import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { readDefinition } from './module-discovery';
import { compatibilityProblem } from './module-compatibility';
import { scaffoldModule, scaffoldProblem } from './module-scaffold';

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

    // The generated definition imports defineModule the way every module under
    // packages/ does, by the path out of the package -- so the fake project
    // has to have that file for the import to resolve, and the assertion below
    // can then load the real generated file rather than a reconstruction.
    mkdirSync(path.join(repoRoot, 'cli', 'lib'), { recursive: true });
    writeFileSync(
      path.join(repoRoot, 'cli', 'lib', 'module-definition.ts'),
      `export * from '${path.join(__dirname, 'module-definition')}';\n`,
    );

    written = scaffoldModule('audit-trail', packagesDir, repoRoot);
  });

  it('reports every file it wrote, relative to the project', () => {
    expect(written).toEqual([
      'packages/audit-trail/package.json',
      'packages/audit-trail/tsconfig.json',
      'packages/audit-trail/src/module.ts',
      'packages/audit-trail/src/runtime/audit-trail.service.ts',
      'packages/audit-trail/src/runtime/audit-trail.module.ts',
      'packages/audit-trail/src/runtime/audit-trail.service.spec.ts',
    ]);
  });

  // The whole point of scaffolding rather than documenting: what comes out is
  // read by the CLI's own loader, so the author's first run is never spent on
  // the shape of the definition.
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

  it('carries the marker the community channel looks for', () => {
    const pkg = JSON.parse(read('packages/audit-trail/package.json')) as {
      name: string;
      heryjs: { module: boolean };
    };

    expect(pkg.name).toBe('audit-trail');
    expect(pkg.heryjs.module).toBe(true);
  });

  // Pinned from the project rather than written into the template, so a
  // scaffolded module typechecks against the same NestJS the kernel does.
  it('pins its dependencies to the ranges the project resolves', () => {
    const pkg = JSON.parse(read('packages/audit-trail/package.json')) as {
      devDependencies: Record<string, string>;
    };

    expect(pkg.devDependencies).toEqual({
      '@nestjs/common': '^12.0.1',
      typescript: '^6.0.3',
    });
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
