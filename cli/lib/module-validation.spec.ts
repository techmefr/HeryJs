import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { LoadedModule } from './module-definition';
import { readDefinition } from './module-discovery';
import { unloadablePackages, validateModule } from './module-validation';

const TSCONFIG_WITH_KERNEL = JSON.stringify({
  compilerOptions: { paths: { '#kernel/*': ['../../src/technical/*'] } },
});

/** What a published module declares, so the fixtures below vary one thing. */
const PUBLISHED_MANIFEST = JSON.stringify({
  name: 'probe',
  heryjs: { module: true },
  main: 'dist/module.js',
  files: ['dist', 'src/runtime'],
});

/**
 * A package directory whose manifest is already the published one, so a
 * fixture below varies its runtime and nothing else.
 */
function published(directory: string): string {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'package.json'), PUBLISHED_MANIFEST);

  return directory;
}

function moduleAt(packageDir: string): LoadedModule {
  return {
    name: path.basename(packageDir),
    description: 'a module',
    dest: 'src/modules/probe',
    channel: 'official',
    packageDir,
  } as LoadedModule;
}

describe('validating a module', () => {
  let packagesDir: string;
  let packageDir: string;
  let runtimeDir: string;

  function write(relative: string, contents: string): void {
    const file = path.join(packageDir, relative);

    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }

  function problems(): string[] {
    return validateModule(moduleAt(packageDir));
  }

  beforeEach(() => {
    packagesDir = mkdtempSync(path.join(tmpdir(), 'hery-validate-'));
    packageDir = path.join(packagesDir, 'probe');
    runtimeDir = path.join(packageDir, 'src', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    write('package.json', PUBLISHED_MANIFEST);
    write('tsconfig.json', TSCONFIG_WITH_KERNEL);
    write('src/module.ts', 'export default { name: "probe" };');
    write('src/runtime/probe.service.ts', 'export class ProbeService {}');
    write('src/runtime/probe.service.spec.ts', 'it("runs", () => {});');
  });

  it('passes a module shaped the way the scaffold shapes one', () => {
    expect(problems()).toEqual([]);
  });

  /**
   * None of this is visible from the definition, and all of it fails quietly.
   * The framework's own eleven modules declared none of it for months: the
   * contract was documented, asked of third parties, and never checked here.
   */
  it('refuses a package with no heryjs.module marker', () => {
    write('package.json', JSON.stringify({ name: 'probe', main: 'dist/m.js' }));

    expect(problems()).toEqual([
      expect.stringContaining('"heryjs": { "module": true }'),
      expect.stringContaining('declares no files'),
    ]);
  });

  it('refuses a main that is not compiled JavaScript', () => {
    write(
      'package.json',
      JSON.stringify({
        heryjs: { module: true },
        main: 'src/module.ts',
        files: ['src'],
      }),
    );

    expect(problems()).toEqual([
      expect.stringContaining('which is not compiled JavaScript'),
    ]);
  });

  it('refuses a files that leaves the runtime behind', () => {
    write(
      'package.json',
      JSON.stringify({
        heryjs: { module: true },
        main: 'dist/module.js',
        files: ['dist'],
      }),
    );

    expect(problems()).toEqual(['its files does not publish src/runtime']);
  });

  // Runtime code held in a string constant is the one shape this framework
  // refuses outright: the file the author edits has to be the file the project
  // receives, or the two drift the moment either is touched.
  it('refuses a module with no src/runtime at all', () => {
    const bare = path.join(packagesDir, 'bare');
    published(bare);
    mkdirSync(path.join(bare, 'src'), { recursive: true });
    writeFileSync(path.join(bare, 'src', 'module.ts'), 'export default {};');

    expect(validateModule(moduleAt(bare))).toEqual([
      expect.stringContaining('no src/runtime'),
    ]);
  });

  it('refuses an empty src/runtime', () => {
    const empty = path.join(packagesDir, 'empty');
    published(empty);
    mkdirSync(path.join(empty, 'src', 'runtime'), { recursive: true });

    expect(validateModule(moduleAt(empty))).toEqual([
      'its src/runtime is empty',
    ]);
  });

  // copyRuntime copies the spec in with the code it covers, so a module
  // shipping none leaves its installer a suite that proves nothing.
  it('refuses a runtime shipping no spec', () => {
    const noSpec = path.join(packagesDir, 'no-spec');
    published(noSpec);
    mkdirSync(path.join(noSpec, 'src', 'runtime'), { recursive: true });
    writeFileSync(
      path.join(noSpec, 'src', 'runtime', 'probe.service.ts'),
      'export class ProbeService {}',
    );

    expect(validateModule(moduleAt(noSpec))).toEqual([
      'it ships no spec under src/runtime',
    ]);
  });

  it('refuses a runtime holding nothing but specs', () => {
    const specsOnly = path.join(packagesDir, 'specs-only');
    published(specsOnly);
    mkdirSync(path.join(specsOnly, 'src', 'runtime'), { recursive: true });
    writeFileSync(
      path.join(specsOnly, 'src', 'runtime', 'probe.spec.ts'),
      'it("runs", () => {});',
    );

    expect(validateModule(moduleAt(specsOnly))).toEqual([
      'its src/runtime holds nothing but specs',
    ]);
  });

  // Every write goes through the install context. A module reaching for the
  // filesystem itself is a module whose second install is not idempotent and
  // whose writes never show up in what the command says it touched.
  it('refuses a module.ts that writes files itself', () => {
    write('src/module.ts', "import { writeFileSync } from 'node:fs';");

    expect(problems()).toEqual([expect.stringContaining('imports node:fs')]);
  });

  // The runtime is what ends up in the project, where writing files is the
  // whole point of a storage module.
  it('leaves the runtime free to touch the filesystem', () => {
    write(
      'src/runtime/probe.service.ts',
      "import { writeFileSync } from 'node:fs';\nexport class ProbeService {}",
    );

    expect(problems()).toEqual([]);
  });

  // #kernel/ is the only subpath a module may hold, because that is the one
  // rewriteKernelSpecifiers turns into the project's own #technical/. Any
  // other one arrives in the project pointing at nothing.
  it.each([
    '#technical/auth/session.guard',
    '#modules/mail/mail.service',
    '#functional/blog/blog.service',
  ])('refuses the runtime import %p', (specifier) => {
    write(
      'src/runtime/probe.service.ts',
      `import { thing } from '${specifier}';\nexport const probe = thing;`,
    );

    expect(problems()).toEqual([
      expect.stringContaining(`imports ${specifier}`),
    ]);
  });

  it('accepts a runtime reaching the kernel through #kernel/', () => {
    write(
      'src/runtime/probe.service.ts',
      "import { subjectOf } from '#kernel/capabilities/subject';\nexport const probe = subjectOf;",
    );

    expect(problems()).toEqual([]);
  });

  // Nothing above src/runtime is copied, so a relative import climbing out of
  // it resolves for the author and breaks on arrival.
  it('refuses a relative import climbing out of the runtime', () => {
    write(
      'src/runtime/probe.service.ts',
      "import { thing } from '../shared/thing';\nexport const probe = thing;",
    );

    expect(problems()).toEqual([
      expect.stringContaining('climbs out of the package'),
    ]);
  });

  it('leaves a relative import inside the runtime alone', () => {
    write('src/runtime/nested/thing.ts', 'export const thing = 1;');
    write(
      'src/runtime/probe.service.ts',
      "import { thing } from './nested/thing';\nexport const probe = thing;",
    );

    expect(problems()).toEqual([]);
  });

  it('leaves packages and node builtins alone', () => {
    write(
      'src/runtime/probe.service.ts',
      [
        "import { Injectable } from '@nestjs/common';",
        "import { randomUUID } from 'node:crypto';",
        "import { z } from 'zod';",
        '@Injectable()',
        'export class ProbeService { id = randomUUID(); schema = z; }',
      ].join('\n'),
    );

    expect(problems()).toEqual([]);
  });

  // A module whose tsconfig maps nothing typechecks against no kernel at all,
  // so its author sees green on code the project will refuse.
  it('refuses a kernel import with no #kernel/* path mapped', () => {
    write('tsconfig.json', JSON.stringify({ compilerOptions: {} }));
    write(
      'src/runtime/probe.service.ts',
      "import { subjectOf } from '#kernel/capabilities/subject';\nexport const probe = subjectOf;",
    );

    expect(problems()).toEqual([
      expect.stringContaining('maps no #kernel/* path'),
    ]);
  });

  it('asks for no tsconfig from a runtime that never reaches the kernel', () => {
    write('tsconfig.json', JSON.stringify({ compilerOptions: {} }));

    expect(problems()).toEqual([]);
  });

  /**
   * A published module ships its compiled entry and src/runtime as sources;
   * the tsconfig stays in the author's repository. Demanding one here failed
   * every correctly published package the moment it was validated from the
   * project that depends on it -- which is where this command is meant to run.
   */
  it('asks for no tsconfig from a package that ships none', () => {
    rmSync(path.join(packageDir, 'tsconfig.json'));
    write(
      'src/runtime/probe.service.ts',
      "import { subjectOf } from '#kernel/capabilities/subject';\nexport const probe = subjectOf;",
    );

    expect(problems()).toEqual([]);
  });

  /**
   * Integration tests live outside src/runtime because they exercise the
   * module against a running kernel rather than being copied into the
   * installing project. Left out of the include list, that directory is
   * outside the project, and every typed lint rule reports every file in it as
   * "not found by the project service" -- naming neither the tsconfig nor the
   * entry it is missing.
   */
  it('refuses a test directory the tsconfig leaves out', () => {
    write(
      'tsconfig.json',
      JSON.stringify({ ...JSON.parse(TSCONFIG_WITH_KERNEL), include: ['src'] }),
    );
    write('test/probe.integration-spec.ts', 'it("runs", () => {});');

    expect(problems()).toEqual([expect.stringContaining('does not include')]);
  });

  it('accepts one the tsconfig includes', () => {
    write(
      'tsconfig.json',
      JSON.stringify({
        ...JSON.parse(TSCONFIG_WITH_KERNEL),
        include: ['src', 'test'],
      }),
    );
    write('test/probe.integration-spec.ts', 'it("runs", () => {});');

    expect(problems()).toEqual([]);
  });

  // A tsconfig with no include list takes the whole package already.
  it('asks nothing of a tsconfig that includes everything', () => {
    write('test/probe.integration-spec.ts', 'it("runs", () => {});');

    expect(problems()).toEqual([]);
  });

  it('says nothing about a test directory that is not there', () => {
    write(
      'tsconfig.json',
      JSON.stringify({ ...JSON.parse(TSCONFIG_WITH_KERNEL), include: ['src'] }),
    );

    expect(problems()).toEqual([]);
  });
});

/**
 * The example module is the documentation's own claim that a package can be a
 * module with no runtime dependency on HeryJs. Loaded here exactly the way the
 * CLI loads a community package, and put through the same checks, so the claim
 * cannot quietly stop being true.
 */
describe('the example community module', () => {
  const packageDir = path.resolve(
    __dirname,
    '..',
    '..',
    'examples',
    'hery-module-maintenance',
  );

  function loaded(): LoadedModule {
    const module = readDefinition(
      path.join(packageDir, 'src', 'module.ts'),
      'community',
      packageDir,
      'hery-module-maintenance',
    );

    if (module === undefined) {
      throw new Error('the example module no longer loads');
    }

    return module;
  }

  it('loads as a module the CLI can install', () => {
    expect(loaded().name).toBe('maintenance');
  });

  it('satisfies the contract module:validate checks', () => {
    expect(validateModule(loaded())).toEqual([]);
  });

  // Its definition never mentions a destination: the one place a module lands
  // is the loader's to fill in, and declaring it there is refused.
  it('lands under src/modules without declaring it', () => {
    expect(loaded().dest).toBe('src/modules/maintenance');
  });

  // The marker is the whole community channel: no marker, and the package is
  // an ordinary dependency the loader walks straight past.
  it('carries the heryjs.module marker', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    ) as { heryjs?: { module?: boolean }; files?: string[] };

    expect(manifest.heryjs?.module).toBe(true);
  });

  // copyRuntime copies files rather than building them, so a published module
  // ships src/runtime as TypeScript sources next to its compiled entry.
  it('publishes its runtime as sources', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    ) as { files?: string[]; main?: string };

    expect(manifest.files).toContain('src/runtime');
    expect(manifest.main).toBe('dist/module.js');
  });

  /**
   * The contract is a type, so importing it leaves nothing behind: `import
   * type` is erased by the compiler and the published package has no runtime
   * dependency on HeryJs. A value import would be a real one, and the module
   * would stop loading anywhere the framework is not installed -- which is
   * what a plain `import` here would quietly become.
   */
  it('imports the contract as a type and nothing else', () => {
    const definition = readFileSync(
      path.join(packageDir, 'src', 'module.ts'),
      'utf8',
    );

    const imports = [...definition.matchAll(/^import\s+(.*)$/gm)].map(
      (match) => match[1] as string,
    );

    expect(imports).toEqual(["type { ModuleDefinition } from 'heryjs';"]);
  });
});

describe('packages the loader could not load', () => {
  let packagesDir: string;

  function packageWithEntry(name: string): string {
    const dir = path.join(packagesDir, name);

    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'module.ts'), 'export default {};');

    return dir;
  }

  beforeEach(() => {
    packagesDir = mkdtempSync(path.join(tmpdir(), 'hery-unloadable-'));
  });

  it('names a package holding a module.ts the loader did not hand back', () => {
    packageWithEntry('broken');
    const loaded = moduleAt(packageWithEntry('working'));

    expect(unloadablePackages(packagesDir, [loaded])).toEqual([
      path.join(path.basename(packagesDir), 'broken'),
    ]);
  });

  it('says nothing about a directory that is not a module', () => {
    mkdirSync(path.join(packagesDir, 'notes'));

    expect(unloadablePackages(packagesDir, [])).toEqual([]);
  });

  it('says nothing when there is no packages directory', () => {
    expect(unloadablePackages(path.join(packagesDir, 'nowhere'), [])).toEqual(
      [],
    );
  });
});
