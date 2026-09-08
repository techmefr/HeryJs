import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { LoadedModule } from './module-definition';
import { unloadablePackages, validateModule } from './module-validation';

const TSCONFIG_WITH_KERNEL = JSON.stringify({
  compilerOptions: { paths: { '#kernel/*': ['../../src/technical/*'] } },
});

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
    write('tsconfig.json', TSCONFIG_WITH_KERNEL);
    write('src/module.ts', 'export default { name: "probe" };');
    write('src/runtime/probe.service.ts', 'export class ProbeService {}');
    write('src/runtime/probe.service.spec.ts', 'it("runs", () => {});');
  });

  it('passes a module shaped the way the scaffold shapes one', () => {
    expect(problems()).toEqual([]);
  });

  // Runtime code held in a string constant is the one shape this framework
  // refuses outright: the file the author edits has to be the file the project
  // receives, or the two drift the moment either is touched.
  it('refuses a module with no src/runtime at all', () => {
    const bare = path.join(packagesDir, 'bare');
    mkdirSync(path.join(bare, 'src'), { recursive: true });
    writeFileSync(path.join(bare, 'src', 'module.ts'), 'export default {};');

    expect(validateModule(moduleAt(bare))).toEqual([
      expect.stringContaining('no src/runtime'),
    ]);
  });

  it('refuses an empty src/runtime', () => {
    const empty = path.join(packagesDir, 'empty');
    mkdirSync(path.join(empty, 'src', 'runtime'), { recursive: true });

    expect(validateModule(moduleAt(empty))).toEqual([
      'its src/runtime is empty',
    ]);
  });

  // copyRuntime copies the spec in with the code it covers, so a module
  // shipping none leaves its installer a suite that proves nothing.
  it('refuses a runtime shipping no spec', () => {
    const noSpec = path.join(packagesDir, 'no-spec');
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
