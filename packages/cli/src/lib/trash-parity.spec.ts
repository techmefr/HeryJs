import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
import { buildResourceContext } from './resource-context';
import { specFile } from './templates';

function specFor(view: string, del: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-trash-'));
  const file = path.join(dir, 'note.yaml');
  writeFileSync(
    file,
    `name: Note
fields:
  - name: title
    type: string
permissions:
  view: ${view}
  create: own
  update: own
  delete: ${del}
`,
  );

  return specFile(buildResourceContext(loadBlueprint(file)));
}

describe('the generated bin parity spec', () => {
  it('keeps a trashed record out of a stranger bin when view is narrower than all', () => {
    expect(specFor('own', 'own')).toContain(
      'keeps a trashed record out of the bin of anyone who cannot open it',
    );
  });

  it('asserts nothing about a stranger bin under view: all, where the stranger can open the record', () => {
    const spec = specFor('all', 'own');

    expect(spec).not.toContain('keeps a trashed record out of the bin');
    expect(spec).not.toContain('refuses to list the trash outright');
  });
});
