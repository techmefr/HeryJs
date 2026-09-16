import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { blueprintSchema, loadBlueprint } from './blueprint';

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

describe('loadBlueprint resolving soft deletes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'hery-blueprint-'));
  });

  it('turns soft deletes on for a blueprint that says nothing about them', () => {
    writeBlueprint(
      dir,
      'note',
      `
name: Note
fields:
  - name: body
    type: string
sorts: []
`,
    );

    expect(loadBlueprint(path.join(dir, 'note.yaml')).softDeletes).toBe(true);
  });

  it('carries an explicit opt-out through to the resolved blueprint', () => {
    writeBlueprint(
      dir,
      'note',
      `
name: Note
softDeletes: false
fields:
  - name: body
    type: string
sorts: []
`,
    );

    expect(loadBlueprint(path.join(dir, 'note.yaml')).softDeletes).toBe(false);
  });

  it('refuses softDeletes on an unrouted resource', () => {
    writeBlueprint(
      dir,
      'note',
      `
name: Note
routed: false
softDeletes: false
fields:
  - name: body
    type: string
sorts: []
`,
    );

    expect(() => loadBlueprint(path.join(dir, 'note.yaml'))).toThrow(
      /softDeletes only applies to a routed resource/,
    );
  });

  it('refuses a filter on deletedAt when soft deletes are turned off', () => {
    writeBlueprint(
      dir,
      'note',
      `
name: Note
softDeletes: false
fields:
  - name: body
    type: string
sorts: []
filters: [deletedAt]
`,
    );

    expect(() => loadBlueprint(path.join(dir, 'note.yaml'))).toThrow(
      /deletedAt/,
    );
  });
});

describe('unknown blueprint keys', () => {
  /**
   * The failure this closes: zod drops an unrecognised key by default, so a
   * typo parsed cleanly and fell back to the schema's defaults. The author saw
   * a resource that ignored what they had declared, with nothing anywhere
   * saying why -- and the coherence checks could not help, since they run on
   * the already-stripped object where the typo no longer exists.
   */
  it('refuses a misspelled top-level key instead of dropping it', () => {
    expect(() =>
      blueprintSchema.parse({
        name: 'BlogPost',
        fields: [],
        pagintaion: { default: 15 },
      }),
    ).toThrow();
  });

  it('refuses a misspelled key nested inside pagination', () => {
    expect(() =>
      blueprintSchema.parse({
        name: 'BlogPost',
        fields: [],
        pagination: { limits: [10], defualt: 10 },
      }),
    ).toThrow();
  });

  it('refuses an unknown key on a field', () => {
    expect(() =>
      blueprintSchema.parse({
        name: 'BlogPost',
        fields: [{ name: 'title', type: 'string', nulable: true }],
      }),
    ).toThrow();
  });

  it('refuses an unknown permission rather than defaulting it to own', () => {
    expect(() =>
      blueprintSchema.parse({
        name: 'BlogPost',
        fields: [],
        permissions: { veiw: 'all' },
      }),
    ).toThrow();
  });

  it('still accepts a blueprint that only uses keys it declares', () => {
    expect(() =>
      blueprintSchema.parse({
        name: 'BlogPost',
        fields: [{ name: 'title', type: 'string' }],
        pagination: { limits: [10, 20], default: 10 },
      }),
    ).not.toThrow();
  });
});
