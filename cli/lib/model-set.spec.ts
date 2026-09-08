import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { MODEL_REGISTRIES, modelSetMarker, modelSetPattern } from './model-set';
import { withoutSetEntries } from './strip-example';

const ROOT = path.join(__dirname, '..', '..');

function sourceOf(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8');
}

/**
 * The generator, the scaffolder and the rls check all reach into these Sets
 * by pattern, so the way they are written is a contract. Annotating one of
 * them broke that contract silently: the check went on reporting on an empty
 * scan, and `hery generate` would have written into a Set nothing read.
 */
describe('the kernel model registries', () => {
  it.each(MODEL_REGISTRIES)(
    'declares $set the way the tooling reads it',
    ({ file, set }) => {
      const source = sourceOf(file).replace(/\/\/[^\n]*/g, '');

      expect(source).toContain(modelSetMarker(set));
      expect(modelSetPattern(set).test(source)).toBe(true);
    },
  );

  /**
   * `hery new` strips the demo's models out of the registries below, and one
   * that named only those comes out empty. TypeScript infers `Set<never>`
   * from an empty literal, and every `.has(model)` against it stops
   * compiling -- which is how AUDITED_MODELS, whose one entry was BlogPost,
   * produced a fresh project that failed its own typecheck.
   */
  it.each(MODEL_REGISTRIES.filter((registry) => registry.stripped))(
    'still names its element type once $set is emptied',
    ({ file, set }) => {
      const source = sourceOf(file);
      const everyModel = new Set(
        [
          ...(modelSetPattern(set).exec(source)?.[1] ?? '').matchAll(
            /'([^']+)'/g,
          ),
        ].map((entry) => entry[1] as string),
      );

      expect(everyModel.size).toBeGreaterThan(0);
      expect(withoutSetEntries(source, set, everyModel)).toContain(
        `${modelSetMarker(set)}])`,
      );
    },
  );
});
