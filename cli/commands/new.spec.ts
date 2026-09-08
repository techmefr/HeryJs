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
  it.each(['author', 'bugs', 'homepage', 'keywords', 'license', 'repository'])(
    'does not inherit the framework field %s',
    (field) => {
      expect(REPO_MANIFEST[field]).toBeDefined();
      expect(generated()[field]).toBeUndefined();
    },
  );

  // The kernel version a project was generated from travels in
  // cli/lib/kernel-version.ts; the number in package.json is the project's.
  it('starts at its own first version, not the kernel release', () => {
    expect(generated().version).toBe('0.0.1');
    expect(generated().version).not.toBe(REPO_MANIFEST.version);
  });

  it('keeps the project private, the way this repository is', () => {
    expect(generated().private).toBe(true);
  });

  // Both assume something a fresh project does not have: an examples/
  // directory, and this repository's own admin/ and docs/ workspaces.
  it('drops the checks that need this repository around them', () => {
    const scripts = generated().scripts as Record<string, string>;

    expect(scripts['lint:example']).toBeUndefined();
    expect(scripts.lint).not.toContain('examples');
    expect(scripts.lint).not.toContain('pnpm --filter admin');
  });

  it('runs its suite over its own src only', () => {
    expect((generated().jest as { roots: string[] }).roots).toEqual([
      '<rootDir>/src',
    ]);
  });

  it('leaves the source manifest alone', () => {
    projectManifest(REPO_MANIFEST, 'my-app');

    expect(REPO_MANIFEST.name).toBe('heryjs');
    expect(REPO_MANIFEST.license).toBe('MIT');
  });
});
