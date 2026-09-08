import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { defineModule, definitionProblems } from './module-definition';
import type { LoadedModule } from './module-definition';
import { createInstallContext } from './module-context';

const VALID = {
  name: 'probe',
  description: 'A module used only by this test.',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/modules/probe',
  install: () => undefined,
};

describe('what makes a module definition', () => {
  it('accepts a complete definition', () => {
    expect(definitionProblems(VALID)).toEqual([]);
  });

  it('keeps the definition it is handed', () => {
    expect(defineModule(VALID)).toBe(VALID);
  });

  // The whole point of reading an export instead of a side effect: a package
  // that exports the wrong thing has to be reported. Before this, a community
  // module loaded and registered nothing, with no message at all.
  it('rejects something that is not an object', () => {
    expect(definitionProblems(undefined)).toEqual([
      'its default export is not an object',
    ]);
    expect(definitionProblems('a module')).toEqual([
      'its default export is not an object',
    ]);
    expect(definitionProblems(null)).toEqual([
      'its default export is not an object',
    ]);
  });

  it('names every field a bare object is missing', () => {
    expect(definitionProblems({})).toEqual([
      'it declares no name',
      'it declares no description',
      'it declares no dest',
      'it declares no install function',
      'it declares no meta',
    ]);
  });

  it.each(['name', 'description', 'dest'])(
    'rejects a definition whose %s is missing',
    (field) => {
      const partial = { ...VALID, [field]: undefined };

      expect(definitionProblems(partial)).toEqual([`it declares no ${field}`]);
    },
  );

  // An empty string is the shape a scaffold leaves behind when the author has
  // not filled it in yet, so it has to count as missing rather than present.
  it('treats an empty string as a missing field', () => {
    expect(definitionProblems({ ...VALID, name: '' })).toEqual([
      'it declares no name',
    ]);
  });

  it('rejects a definition with no install function', () => {
    expect(definitionProblems({ ...VALID, install: 'run it' })).toEqual([
      'it declares no install function',
    ]);
  });

  it('rejects a definition that declares no compatibility', () => {
    expect(definitionProblems({ ...VALID, meta: {} })).toEqual([
      'it declares no meta.compatibility',
    ]);
  });
});

describe('the install context', () => {
  let packageDir: string;
  let projectDir: string;
  let cwd: string;
  let logged: string[];

  function contextFor(dest = 'src/modules/probe') {
    const module: LoadedModule = {
      ...VALID,
      dest,
      channel: 'community',
      packageDir,
    };

    return createInstallContext(module);
  }

  beforeEach(() => {
    packageDir = mkdtempSync(path.join(tmpdir(), 'hery-package-'));
    projectDir = mkdtempSync(path.join(tmpdir(), 'hery-project-'));
    mkdirSync(path.join(packageDir, 'src', 'runtime'), { recursive: true });
    cwd = process.cwd();
    process.chdir(projectDir);

    logged = [];
    jest.spyOn(console, 'log').mockImplementation((message: unknown) => {
      logged.push(String(message));
    });
  });

  afterEach(() => {
    process.chdir(cwd);
    jest.restoreAllMocks();
  });

  function authorRuntimeFile(name: string, contents: string): void {
    const file = path.join(packageDir, 'src', 'runtime', name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }

  describe('copying the runtime', () => {
    it('writes it at the destination the definition declares', () => {
      authorRuntimeFile('probe.ts', 'export const PROBE = true;\n');

      contextFor().copyRuntime();

      expect(readFileSync('src/modules/probe/probe.ts', 'utf8')).toBe(
        'export const PROBE = true;\n',
      );
    });

    // A module lands at three different depths depending on what it extends,
    // so the destination is data, not a convention this can assume.
    it('honours a destination outside src/modules', () => {
      authorRuntimeFile('driver.ts', 'export const DRIVER = 1;\n');

      contextFor('src/technical/search').copyRuntime();

      expect(readFileSync('src/technical/search/driver.ts', 'utf8')).toContain(
        'DRIVER',
      );
    });

    it('rewrites a kernel specifier to the one the app uses', () => {
      authorRuntimeFile(
        'probe.ts',
        "import { thing } from '#kernel/tenancy/thing';\n",
      );

      contextFor().copyRuntime();

      expect(readFileSync('src/modules/probe/probe.ts', 'utf8')).toBe(
        "import { thing } from '#technical/tenancy/thing';\n",
      );
    });

    // "Own your code" is what makes this the important one: a file the
    // developer has edited must survive a second install untouched.
    it('never overwrites a file the developer already has', () => {
      authorRuntimeFile('probe.ts', 'export const PROBE = true;\n');
      mkdirSync('src/modules/probe', { recursive: true });
      writeFileSync('src/modules/probe/probe.ts', 'mine, edited by hand\n');

      contextFor().copyRuntime();

      expect(readFileSync('src/modules/probe/probe.ts', 'utf8')).toBe(
        'mine, edited by hand\n',
      );
      expect(logged.join('\n')).toContain('already exists, skipping');
    });

    it('records only what it actually wrote', () => {
      authorRuntimeFile('written.ts', 'export const A = 1;\n');
      authorRuntimeFile('kept.ts', 'export const B = 2;\n');
      mkdirSync('src/modules/probe', { recursive: true });
      writeFileSync('src/modules/probe/kept.ts', 'mine\n');

      const context = contextFor();
      context.copyRuntime();

      expect(context.touched).toEqual(['src/modules/probe/written.ts']);
    });
  });

  describe('copying a file from the package root', () => {
    it('writes it into the project under the same name', () => {
      writeFileSync(
        path.join(packageDir, 'docker-compose.probe.yml'),
        'x: 1\n',
      );

      const context = contextFor();
      context.copyPackageFile('docker-compose.probe.yml');

      expect(readFileSync('docker-compose.probe.yml', 'utf8')).toBe('x: 1\n');
      expect(context.touched).toEqual(['docker-compose.probe.yml']);
    });

    it('leaves one the project already has alone', () => {
      writeFileSync(
        path.join(packageDir, 'docker-compose.probe.yml'),
        'x: 1\n',
      );
      writeFileSync('docker-compose.probe.yml', 'mine\n');

      const context = contextFor();
      context.copyPackageFile('docker-compose.probe.yml');

      expect(readFileSync('docker-compose.probe.yml', 'utf8')).toBe('mine\n');
      expect(context.touched).toEqual([]);
    });
  });

  describe('patching a file the project owns', () => {
    it('writes what the edit returns', () => {
      writeFileSync('schema.prisma', 'model User {}\n');

      const context = contextFor();
      context.patch(
        'schema.prisma',
        'model Probe',
        (source) => `${source}model Probe {}\n`,
      );

      expect(readFileSync('schema.prisma', 'utf8')).toBe(
        'model User {}\nmodel Probe {}\n',
      );
      expect(context.touched).toEqual(['schema.prisma']);
    });

    // Installing twice has to be a no-op, and the guard lives here rather than
    // in each module so no author can forget it.
    it('does nothing when the marker is already there', () => {
      writeFileSync('schema.prisma', 'model Probe {}\n');
      const edit = jest.fn();

      const context = contextFor();
      context.patch('schema.prisma', 'model Probe', edit);

      expect(edit).not.toHaveBeenCalled();
      expect(context.touched).toEqual([]);
      expect(logged.join('\n')).toContain('already has model Probe, skipping');
    });

    // Every caller extends something the project already owns, so a missing
    // file means this project is not shaped the way the module expected --
    // creating it would invent a file nobody asked for.
    it('skips a file that is not there rather than creating it', () => {
      const context = contextFor();
      context.patch('nowhere.yaml', 'marker', () => 'written');

      expect(context.touched).toEqual([]);
      expect(logged.join('\n')).toContain('does not exist here, skipping');
    });

    it('skips when the edit decides there is nothing to do', () => {
      writeFileSync('package.json', '{}\n');

      const context = contextFor();
      context.patch('package.json', 'marker', () => undefined);

      expect(readFileSync('package.json', 'utf8')).toBe('{}\n');
      expect(context.touched).toEqual([]);
      expect(logged.join('\n')).toContain('nothing to patch, skipping');
    });

    it('skips when the edit returns the file unchanged', () => {
      writeFileSync('package.json', '{}\n');

      const context = contextFor();
      context.patch('package.json', 'marker', (source) => source);

      expect(context.touched).toEqual([]);
    });
  });

  it('numbers the closing steps', () => {
    contextFor().nextSteps(['do this', 'then that']);

    expect(logged).toContain('  1. do this');
    expect(logged).toContain('  2. then that');
  });

  it('records every write in the order they happened', () => {
    authorRuntimeFile('probe.ts', 'export const PROBE = true;\n');
    writeFileSync(path.join(packageDir, 'compose.yml'), 'x: 1\n');
    writeFileSync('schema.prisma', 'model User {}\n');

    const context = contextFor();
    context.copyPackageFile('compose.yml');
    context.copyRuntime();
    context.patch('schema.prisma', 'Probe', (source) => `${source}Probe\n`);

    expect(context.touched).toEqual([
      'compose.yml',
      'src/modules/probe/probe.ts',
      'schema.prisma',
    ]);
  });
});
