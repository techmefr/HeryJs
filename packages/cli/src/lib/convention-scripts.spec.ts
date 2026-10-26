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
import {
  copiedConventionScripts,
  removeCopiedConventionScripts,
  withProjectConventionScripts,
} from './convention-scripts';
import { COPIED_CONVENTION_SCRIPTS } from './copied-conventions';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const UNCHANGED = ['check-kernel-version.ts', 'regenerate-examples.ts'];

describe('the convention scripts an older hery new copied', () => {
  let root: string;

  const copy = (file: string): void =>
    copyFileSync(
      path.join(REPO_ROOT, 'scripts', file),
      path.join(root, 'scripts', file),
    );

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-convention-scripts-'));
    mkdirSync(path.join(root, 'scripts', 'postgres'), { recursive: true });
    writeFileSync(path.join(root, 'scripts', 'postgres', 'app-role.sql'), '');
    UNCHANGED.forEach(copy);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('recognises a file exactly as this repository shipped it', () => {
    expect(copiedConventionScripts(root)).toEqual({
      identical: UNCHANGED.map((file) => path.join('scripts', file)),
      modified: [],
    });
  });

  it('keeps a modified copy and removes only the identical ones', () => {
    writeFileSync(
      path.join(root, 'scripts', 'check-kernel-version.ts'),
      '// changed by the project\n',
    );
    const scripts = copiedConventionScripts(root);

    expect(scripts.modified).toEqual([
      path.join('scripts', 'check-kernel-version.ts'),
    ]);

    removeCopiedConventionScripts(root, scripts, { write: true });

    expect(
      existsSync(path.join(root, 'scripts', 'check-kernel-version.ts')),
    ).toBe(true);
    expect(
      existsSync(path.join(root, 'scripts', 'regenerate-examples.ts')),
    ).toBe(false);
    expect(
      existsSync(path.join(root, 'scripts', 'postgres', 'app-role.sql')),
    ).toBe(true);
  });

  it('writes nothing when only asked what would change', () => {
    const changed = removeCopiedConventionScripts(
      root,
      copiedConventionScripts(root),
      { write: false },
    );

    expect(changed).toHaveLength(UNCHANGED.length);
    UNCHANGED.forEach((file) =>
      expect(existsSync(path.join(root, 'scripts', file))).toBe(true),
    );
  });

  it('keeps every copy when the registry itself was modified', () => {
    writeFileSync(
      path.join(root, 'scripts', 'check-conventions.ts'),
      '// the project runs its own set\n',
    );

    expect(copiedConventionScripts(root)).toEqual({
      identical: [],
      modified: [
        path.join('scripts', 'check-conventions.ts'),
        ...UNCHANGED.map((file) => path.join('scripts', file)),
      ],
    });
  });

  it('moves the package scripts and the CI step to hery check with the registry', () => {
    const registry = Object.keys(COPIED_CONVENTION_SCRIPTS).find((file) =>
      file.endsWith('check-conventions.ts'),
    );

    expect(registry).toBe('scripts/check-conventions.ts');

    mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(
      path.join(root, '.github', 'workflows', 'ci.yml'),
      '      - run: pnpm run lint:conventions\n',
    );
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        scripts: {
          'lint:conventions': 'ts-node scripts/check-conventions.ts',
          'lint:rls': 'pnpm run lint:conventions rls',
          build: 'nest build',
        },
      }),
    );

    const changed = removeCopiedConventionScripts(
      root,
      { identical: ['scripts/check-conventions.ts'], modified: [] },
      { write: false },
    );

    expect(changed).toEqual([
      'scripts/check-conventions.ts',
      'package.json',
      path.join('.github', 'workflows', 'ci.yml'),
    ]);
  });

  it('replaces every script that runs the framework registry with hery check', () => {
    expect(
      withProjectConventionScripts({
        'lint:conventions':
          'NODE_OPTIONS="--conditions=development" ts-node scripts/check-conventions.ts',
        'lint:subject': 'pnpm run lint:conventions subject',
        'lint:hery': 'ts-node cli/hery.ts lint --min-score 100',
      }),
    ).toEqual({
      'lint:hery': 'ts-node cli/hery.ts lint --min-score 100',
      check: 'pnpm hery check',
    });
  });
});

describe('the record of shipped convention scripts', () => {
  it('covers every script this repository still has unchanged', () => {
    UNCHANGED.forEach((file) =>
      expect(COPIED_CONVENTION_SCRIPTS[`scripts/${file}`]).toBeDefined(),
    );
  });

  it('does not list the scripts a project still gets', () => {
    expect(
      Object.keys(COPIED_CONVENTION_SCRIPTS).filter(
        (file) => !/^scripts\/[^/]+\.ts$/.test(file),
      ),
    ).toEqual([]);
    expect(
      readFileSync(
        path.join(REPO_ROOT, 'packages', 'cli', 'src', 'commands', 'new.ts'),
        'utf8',
      ),
    ).toContain("'scripts/postgres'");
  });
});
