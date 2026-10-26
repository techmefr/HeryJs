import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { findFrameworkRoot, frameworkRoot } from './framework-root';

const CLI_SOURCE = path.join('packages', 'cli', 'src');

function payloadAt(root: string): void {
  mkdirSync(path.join(root, CLI_SOURCE), { recursive: true });
  mkdirSync(path.join(root, 'templates'), { recursive: true });
  writeFileSync(path.join(root, CLI_SOURCE, 'hery.ts'), '');
}

describe('finding the payload a project is scaffolded from', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-payload-'));
    payloadAt(root);
  });

  it('finds it from the source layout, where the caller sits in packages/cli/src/commands', () => {
    expect(frameworkRoot(path.join(root, CLI_SOURCE, 'commands'))).toBe(root);
  });

  /**
   * The one the published package needs: the compiled scaffolder sits under
   * dist/, so the payload is further up. A hardcoded depth silently resolved
   * to dist/ and copied nothing.
   */
  it('finds it from the compiled layout, deeper under dist', () => {
    const compiled = path.join(root, 'dist', 'scaffold', CLI_SOURCE, 'lib');
    mkdirSync(compiled, { recursive: true });

    expect(frameworkRoot(compiled)).toBe(root);
  });

  it('stops at the nearest payload rather than the outermost', () => {
    const inner = path.join(root, 'nested');
    payloadAt(inner);

    expect(frameworkRoot(path.join(inner, CLI_SOURCE))).toBe(inner);
  });

  it('says so rather than walking out to the filesystem root', () => {
    const orphan = mkdtempSync(path.join(tmpdir(), 'hery-orphan-'));

    expect(() => frameworkRoot(orphan)).toThrow(
      'Could not find the HeryJs payload',
    );
    expect(findFrameworkRoot(orphan)).toBeUndefined();
  });

  // Half a payload is not a payload: node_modules holds plenty of packages
  // with sources of their own.
  it('is not fooled by the CLI sources with no templates beside them', () => {
    const half = mkdtempSync(path.join(tmpdir(), 'hery-half-'));
    mkdirSync(path.join(half, CLI_SOURCE), { recursive: true });
    writeFileSync(path.join(half, CLI_SOURCE, 'hery.ts'), '');

    expect(() => frameworkRoot(half)).toThrow(
      'Could not find the HeryJs payload',
    );
  });

  /**
   * A generated project runs the CLI it installed, from node_modules. Taken
   * for the framework, it sent `hery upgrade` looking for the kernel's own
   * sources inside the project.
   */
  it('does not take a generated project for one', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'hery-project-'));
    const installed = path.join(
      project,
      'node_modules',
      '@heryjs',
      'cli',
      'dist',
      'lib',
    );
    mkdirSync(installed, { recursive: true });
    mkdirSync(path.join(project, 'packages', 'two-factor'), {
      recursive: true,
    });
    writeFileSync(path.join(project, 'package.json'), '{}');

    expect(findFrameworkRoot(installed)).toBeUndefined();
  });

  it('answers for this repository when asked from its own source', () => {
    expect(frameworkRoot()).toBe(
      path.resolve(__dirname, '..', '..', '..', '..'),
    );
  });
});
