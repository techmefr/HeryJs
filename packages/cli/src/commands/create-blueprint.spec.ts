import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { BlueprintError, loadBlueprint } from '../lib/blueprint';
import { allOptionsTemplate } from './create-blueprint';

function write(content: string): string {
  const file = path.join(
    mkdtempSync(path.join(tmpdir(), 'hery-all-options-')),
    'widget.yaml',
  );
  writeFileSync(file, content);

  return file;
}

describe('create:blueprint --all-options', () => {
  const template = allOptionsTemplate('Widget');

  it('writes a blueprint the generator accepts as it stands', () => {
    expect(loadBlueprint(write(template)).name).toBe('Widget');
  });

  it.each([
    'file',
    'encrypted',
    'vector',
    'slug',
    'richtext',
    'translatable',
    'personal',
    'erasure',
    'workflow',
    'history',
  ])('documents %s', (option) => {
    expect(template).toContain(option);
  });

  it('names the combinations the generator refuses', () => {
    expect(template).toContain('Not compatible with history: true');
    expect(template).toContain('a slug or a richtext field cannot be');
  });
});

describe('a blueprint its author has to correct', () => {
  it('is a BlueprintError, which the CLI prints without a stack trace', () => {
    expect(() =>
      loadBlueprint(write('name: Widget\nfields:\n  - name: 1\n')),
    ).toThrow(BlueprintError);
  });

  it('names the incoherence it found', () => {
    expect(() =>
      loadBlueprint(
        write(
          'name: Widget\nhistory: true\nfields:\n  - name: title\n    type: string\n    translatable: true\n',
        ),
      ),
    ).toThrow(/history does not snapshot yet/);
  });
});
