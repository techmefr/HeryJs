import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBlueprint } from './blueprint';

function writeBlueprint(dir: string, name: string, yaml: string): void {
  writeFileSync(path.join(dir, `${name}.yaml`), yaml);
}

describe('loadBlueprint resolving nested includes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'hery-blueprint-'));
  });

  it("exposes a referenced hasMany include's own includes one level down", () => {
    writeBlueprint(
      dir,
      'reaction',
      `
name: Reaction
routed: false
fields:
  - name: emoji
    type: string
sorts: []
`,
    );

    writeBlueprint(
      dir,
      'reply',
      `
name: Reply
routed: false
fields:
  - name: body
    type: string
sorts: []
includes:
  - relation: reactions
    resource: Reaction
    type: hasMany
    foreignKey: replyId
`,
    );

    writeBlueprint(
      dir,
      'note',
      `
name: Note
routed: false
fields:
  - name: body
    type: string
sorts: []
includes:
  - relation: replies
    resource: Reply
    type: hasMany
    foreignKey: noteId
`,
    );

    const blueprint = loadBlueprint(path.join(dir, 'note.yaml'));
    const replies = blueprint.includes.find((i) => i.relation === 'replies');

    expect(replies?.includes).toEqual([
      expect.objectContaining({ relation: 'reactions' }),
    ]);
    // Capped at one level: the grandchild's own includes are never carried
    // through, so a caller can never reach a fourth level by chaining.
    expect(replies?.includes?.[0]?.includes).toBeUndefined();
  });

  it('never exposes a nested include on a morphMany link', () => {
    writeBlueprint(
      dir,
      'reaction',
      `
name: Reaction
routed: false
fields:
  - name: emoji
    type: string
sorts: []
`,
    );

    writeBlueprint(
      dir,
      'flag',
      `
name: Flag
routed: false
fields:
  - name: reason
    type: string
sorts: []
includes:
  - relation: reactions
    resource: Reaction
    type: hasMany
    foreignKey: flagId
`,
    );

    writeBlueprint(
      dir,
      'note',
      `
name: Note
routed: false
fields:
  - name: body
    type: string
sorts: []
includes:
  - relation: flags
    resource: Flag
    type: morphMany
    foreignKey: flaggableId
    discriminator: flaggableType
    discriminatorValue: Note
`,
    );

    const blueprint = loadBlueprint(path.join(dir, 'note.yaml'));
    const flags = blueprint.includes.find((i) => i.relation === 'flags');

    expect(flags?.includes).toBeUndefined();
  });

  it('never carries a nested morphMany link through, even under a hasMany parent', () => {
    writeBlueprint(
      dir,
      'flag',
      `
name: Flag
routed: false
fields:
  - name: reason
    type: string
sorts: []
`,
    );

    writeBlueprint(
      dir,
      'reply',
      `
name: Reply
routed: false
fields:
  - name: body
    type: string
sorts: []
includes:
  - relation: flags
    resource: Flag
    type: morphMany
    foreignKey: flaggableId
    discriminator: flaggableType
    discriminatorValue: Reply
`,
    );

    writeBlueprint(
      dir,
      'note',
      `
name: Note
routed: false
fields:
  - name: body
    type: string
sorts: []
includes:
  - relation: replies
    resource: Reply
    type: hasMany
    foreignKey: noteId
`,
    );

    const blueprint = loadBlueprint(path.join(dir, 'note.yaml'));
    const replies = blueprint.includes.find((i) => i.relation === 'replies');

    expect(replies?.includes).toBeUndefined();
  });

  it('carries the referenced blueprint pagination onto an ownRoute include', () => {
    writeBlueprint(
      dir,
      'reply',
      `
name: Reply
routed: false
fields:
  - name: body
    type: string
sorts: []
pagination:
  limits: [5, 10]
  default: 5
`,
    );

    writeBlueprint(
      dir,
      'note',
      `
name: Note
routed: false
fields:
  - name: body
    type: string
sorts: []
includes:
  - relation: replies
    resource: Reply
    type: hasMany
    foreignKey: noteId
    ownRoute: true
`,
    );

    const blueprint = loadBlueprint(path.join(dir, 'note.yaml'));
    const replies = blueprint.includes.find((i) => i.relation === 'replies');

    expect(replies?.pagination).toEqual({ limits: [5, 10], default: 5 });
  });

  it('leaves pagination undefined on an include that did not opt into ownRoute', () => {
    writeBlueprint(
      dir,
      'reply',
      `
name: Reply
routed: false
fields:
  - name: body
    type: string
sorts: []
pagination:
  limits: [5, 10]
  default: 5
`,
    );

    writeBlueprint(
      dir,
      'note',
      `
name: Note
routed: false
fields:
  - name: body
    type: string
sorts: []
includes:
  - relation: replies
    resource: Reply
    type: hasMany
    foreignKey: noteId
`,
    );

    const blueprint = loadBlueprint(path.join(dir, 'note.yaml'));
    const replies = blueprint.includes.find((i) => i.relation === 'replies');

    expect(replies?.pagination).toBeUndefined();
  });

  it('rejects ownRoute on a morphMany link', () => {
    writeBlueprint(
      dir,
      'flag',
      `
name: Flag
routed: false
fields:
  - name: reason
    type: string
sorts: []
`,
    );

    writeBlueprint(
      dir,
      'note',
      `
name: Note
routed: false
fields:
  - name: body
    type: string
sorts: []
includes:
  - relation: flags
    resource: Flag
    type: morphMany
    foreignKey: flaggableId
    discriminator: flaggableType
    discriminatorValue: Note
    ownRoute: true
`,
    );

    expect(() => loadBlueprint(path.join(dir, 'note.yaml'))).toThrow();
  });

  it('rejects ownRoute declared on an aggregate', () => {
    writeBlueprint(
      dir,
      'reply',
      `
name: Reply
routed: false
fields:
  - name: body
    type: int
sorts: []
`,
    );

    writeBlueprint(
      dir,
      'note',
      `
name: Note
routed: false
fields:
  - name: body
    type: string
sorts: []
aggregates:
  - relation: replies
    resource: Reply
    type: hasMany
    foreignKey: noteId
    ownRoute: true
`,
    );

    expect(() => loadBlueprint(path.join(dir, 'note.yaml'))).toThrow(
      /ownRoute/,
    );
  });

  it('leaves includes undefined when the referenced blueprint declares none', () => {
    writeBlueprint(
      dir,
      'reply',
      `
name: Reply
routed: false
fields:
  - name: body
    type: string
sorts: []
`,
    );

    writeBlueprint(
      dir,
      'note',
      `
name: Note
routed: false
fields:
  - name: body
    type: string
sorts: []
includes:
  - relation: replies
    resource: Reply
    type: hasMany
    foreignKey: noteId
`,
    );

    const blueprint = loadBlueprint(path.join(dir, 'note.yaml'));
    const replies = blueprint.includes.find((i) => i.relation === 'replies');

    expect(replies?.includes).toBeUndefined();
  });
});
