import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { addWorkspace, chainScript } from './project-patch';

const MANIFEST = {
  name: 'a-project',
  scripts: { lint: 'eslint .', test: 'jest' },
};

const WORKSPACE = ['packages:', "  - '.'", "  - 'packages/*'", ''].join('\n');

describe('chaining a command onto a root script', () => {
  let manifest: string;

  function scripts(): Record<string, string> {
    return (
      JSON.parse(readFileSync(manifest, 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts;
  }

  beforeEach(() => {
    manifest = path.join(
      mkdtempSync(path.join(tmpdir(), 'hery-manifest-')),
      'package.json',
    );
    writeFileSync(manifest, `${JSON.stringify(MANIFEST, null, 2)}\n`);
  });

  it('appends to what the script already runs', () => {
    expect(chainScript(manifest, 'test', 'pnpm --filter admin test')).toBe(
      'chained',
    );
    expect(scripts().test).toBe('jest && pnpm --filter admin test');
  });

  it('leaves the other scripts alone', () => {
    chainScript(manifest, 'test', 'pnpm --filter admin test');

    expect(scripts().lint).toBe('eslint .');
  });

  // The command is its own guard: a second install must not chain it twice.
  it('says the command is already chained rather than skipping blind', () => {
    chainScript(manifest, 'test', 'pnpm --filter admin test');

    expect(chainScript(manifest, 'test', 'pnpm --filter admin test')).toBe(
      'already chained',
    );
    expect(scripts().test).toBe('jest && pnpm --filter admin test');
  });

  // A project that never had the script is a project shaped differently from
  // the one the module expected, and inventing the script would be worse than
  // saying so -- the caller logs the skip.
  it('tells a missing script apart from an already chained one', () => {
    expect(chainScript(manifest, 'build', 'pnpm --filter admin build')).toBe(
      'no such script',
    );
    expect(scripts().build).toBeUndefined();
  });

  it('keeps the manifest readable', () => {
    chainScript(manifest, 'test', 'pnpm --filter admin test');

    expect(readFileSync(manifest, 'utf8')).toBe(
      `${JSON.stringify(
        {
          ...MANIFEST,
          scripts: {
            lint: 'eslint .',
            test: 'jest && pnpm --filter admin test',
          },
        },
        null,
        2,
      )}\n`,
    );
  });
});

describe('declaring a workspace', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = path.join(
      mkdtempSync(path.join(tmpdir(), 'hery-workspace-')),
      'pnpm-workspace.yaml',
    );
    writeFileSync(workspace, WORKSPACE);
  });

  it('adds the directory to the packages list', () => {
    expect(addWorkspace(workspace, 'admin')).toBe(true);
    expect(readFileSync(workspace, 'utf8')).toBe(
      ['packages:', "  - 'admin'", "  - '.'", "  - 'packages/*'", ''].join(
        '\n',
      ),
    );
  });

  it('does nothing when the directory is already listed', () => {
    addWorkspace(workspace, 'admin');

    expect(addWorkspace(workspace, 'admin')).toBe(false);
  });

  it('refuses a workspace file with no packages list', () => {
    writeFileSync(workspace, 'onlyBuiltDependencies:\n  - esbuild\n');

    expect(() => addWorkspace(workspace, 'admin')).toThrow(
      'declares no packages list',
    );
  });
});
