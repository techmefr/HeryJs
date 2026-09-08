import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { frameworkRoot } from './framework-root';

function payloadAt(root: string): void {
  mkdirSync(path.join(root, 'cli'), { recursive: true });
  mkdirSync(path.join(root, 'packages'), { recursive: true });
  writeFileSync(path.join(root, 'cli', 'hery.ts'), '');
}

describe('finding the payload a project is scaffolded from', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-payload-'));
    payloadAt(root);
  });

  it('finds it from the source layout, where the caller sits in cli/commands', () => {
    expect(frameworkRoot(path.join(root, 'cli', 'commands'))).toBe(root);
  });

  /**
   * The one the published package needs: the compiled scaffolder sits under
   * dist/, so the payload is four levels up instead of two. A hardcoded depth
   * silently resolved to dist/ and copied nothing.
   */
  it('finds it from the compiled layout, two directories deeper', () => {
    const compiled = path.join(root, 'dist', 'scaffold', 'cli', 'lib');
    mkdirSync(compiled, { recursive: true });

    expect(frameworkRoot(compiled)).toBe(root);
  });

  // A generated project is itself a payload: it keeps cli/ and packages/, so
  // `hery new` from inside one scaffolds from that project, as it always has.
  it('stops at the nearest payload rather than the outermost', () => {
    const inner = path.join(root, 'nested');
    payloadAt(inner);

    expect(frameworkRoot(path.join(inner, 'cli'))).toBe(inner);
  });

  it('says so rather than walking out to the filesystem root', () => {
    const orphan = mkdtempSync(path.join(tmpdir(), 'hery-orphan-'));

    expect(() => frameworkRoot(orphan)).toThrow(
      'Could not find the HeryJs payload',
    );
  });

  // Half a payload is not a payload: node_modules holds plenty of packages
  // with a cli/ directory of their own.
  it('is not fooled by a cli directory with no packages beside it', () => {
    const half = mkdtempSync(path.join(tmpdir(), 'hery-half-'));
    mkdirSync(path.join(half, 'cli'), { recursive: true });
    writeFileSync(path.join(half, 'cli', 'hery.ts'), '');

    expect(() => frameworkRoot(half)).toThrow(
      'Could not find the HeryJs payload',
    );
  });

  it('answers for this repository when asked from its own source', () => {
    expect(frameworkRoot()).toBe(path.resolve(__dirname, '..', '..'));
  });
});
