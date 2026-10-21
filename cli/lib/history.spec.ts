import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';
import { historyColumnEntries } from './history-templates';
import { buildResourceContext } from './resource-context';
import { controllerFile, serviceFile, specFile } from './templates';

function load(yaml: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hery-history-'));
  const file = path.join(dir, 'note.yaml');
  writeFileSync(file, yaml);

  return loadBlueprint(file);
}

const NOTE = `
name: Note
history: true
versioned: true
fields:
  - name: body
    type: string
  - name: secret
    type: string
    hidden: true
  - name: token
    type: encrypted
`;

describe('history blueprint flag', () => {
  it('is off unless declared', () => {
    expect(load('name: Note\nfields: []\n').history).toBe(false);
  });

  it('never registers a hidden or encrypted field', () => {
    const ctx = buildResourceContext(load(NOTE));

    expect(historyColumnEntries(ctx)).toEqual([
      'Note.body',
      'Note.deletedAt',
      'Note.version',
    ]);
    expect(serviceFile(ctx)).toContain("HISTORY_REVERTIBLE_FIELDS = ['body']");
  });

  it('adds history, diff and restore routes and a capability for each', () => {
    const controller = controllerFile(buildResourceContext(load(NOTE)));

    expect(controller).toContain("@Post(':id/history')");
    expect(controller).toContain("@Post(':id/history/diff')");
    expect(controller).toContain("@Post(':id/history/restore')");
    expect(controller).toContain('history: true,');
  });

  it('adds none of it to a resource without the flag', () => {
    const ctx = buildResourceContext(load('name: Note\nfields: []\n'));

    expect(controllerFile(ctx)).not.toContain('history');
    expect(serviceFile(ctx)).not.toContain('History');
  });

  it('generates a suite proving snapshots, restore and refusals', () => {
    const spec = specFile(buildResourceContext(load(NOTE)));

    expect(spec).toContain("describe('history'");
    expect(spec).toContain("for (const name of ['secret', 'token'])");
    expect(spec).toContain('not.toHaveProperty(name)');
    expect(spec).toContain('refuses a restore made against a stale version');
  });

  it('refuses history on an unrouted or translatable resource', () => {
    expect(() =>
      load('name: Note\nrouted: false\nhistory: true\nfields: []\nsorts: []\n'),
    ).toThrow(/history only applies to a routed resource/);
    expect(() =>
      load(
        'name: Note\nhistory: true\nfields:\n  - name: body\n    type: string\n    translatable: true\n',
      ),
    ).toThrow(/history does not snapshot yet/);
  });
});
