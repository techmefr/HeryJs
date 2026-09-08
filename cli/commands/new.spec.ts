import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { projectManifest } from './new';

const REPO_MANIFEST = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as Record<string, unknown>;

describe('the manifest a generated project starts from', () => {
  function generated() {
    return projectManifest(REPO_MANIFEST, 'my-app') as unknown as Record<
      string,
      unknown
    >;
  }

  it('takes the name the developer typed', () => {
    expect(generated().name).toBe('my-app');
    expect(generated().description).toBe('A HeryJs project.');
  });

  /**
   * Read from this repository's real manifest rather than a fixture, so a
   * field added here is a field this test sees. Every one of them names the
   * framework, and a project publishing its own package would offer HeryJs's
   * repository, issue tracker and author to the registry as its own.
   */
  it.each([
    'author',
    'bin',
    'bugs',
    'files',
    'homepage',
    'keywords',
    'license',
    'repository',
  ])('does not inherit the framework field %s', (field) => {
    expect(REPO_MANIFEST[field]).toBeDefined();
    expect(generated()[field]).toBeUndefined();
  });

  // The kernel version a project was generated from travels in
  // cli/lib/kernel-version.ts; the number in package.json is the project's.
  it('starts at its own first version, not the kernel release', () => {
    expect(generated().version).toBe('0.0.1');
    expect(generated().version).not.toBe(REPO_MANIFEST.version);
  });

  it('keeps the project private, the way this repository is', () => {
    expect(generated().private).toBe(true);
  });

  /**
   * The framework cannot carry this one: as a lifecycle script it runs inside
   * whoever installs the published package, where prisma is not resolvable,
   * and it failed the install before the scaffolder was ever reached. A
   * project does need it on every install.
   */
  it('regenerates the Prisma client on install, which the framework does not', () => {
    expect(
      (REPO_MANIFEST.scripts as Record<string, string>).postinstall,
    ).toBeUndefined();
    expect((generated().scripts as Record<string, string>).postinstall).toBe(
      'prisma generate',
    );
  });

  /**
   * `hery new` deletes both checks from the project's registry, so leaving
   * their shortcuts behind would offer a script that fails on a name the
   * runner no longer knows. Each asks a question only this repository can
   * answer: the demo against the generator that produced it, and the manifest
   * against the kernel constant -- equal in a release, and deliberately not in
   * a project, whose manifest carries its own version.
   */
  it.each(['lint:example', 'lint:kernel-version'])(
    'drops %s, whose check does not survive the copy',
    (script) => {
      expect(
        (REPO_MANIFEST.scripts as Record<string, string>)[script],
      ).toBeDefined();
      expect(
        (generated().scripts as Record<string, string>)[script],
      ).toBeUndefined();
    },
  );

  // Both assume something a fresh project does not have: an examples/
  // directory, and this repository's own admin/ and docs/ workspaces.
  it('lints only what a project has around it', () => {
    const scripts = generated().scripts as Record<string, string>;

    expect(scripts.lint).not.toContain('examples');
    expect(scripts.lint).not.toContain('pnpm --filter admin');
  });

  it('runs its suite over its own src only', () => {
    expect((generated().jest as { roots: string[] }).roots).toEqual([
      '<rootDir>/src',
    ]);
  });

  // Not only the fields at the top: a shallow copy shares `scripts` and
  // `jest`, and every edit below them reached back into the source.
  it('leaves the source manifest alone, nested objects included', () => {
    const before = JSON.stringify(REPO_MANIFEST);

    projectManifest(REPO_MANIFEST, 'my-app');

    expect(JSON.stringify(REPO_MANIFEST)).toBe(before);
  });
});
