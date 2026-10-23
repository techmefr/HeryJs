import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  annotatedModelsIn,
  registriesFrom,
} from '#technical/prisma/model-annotations';
import {
  annotateField,
  annotateModel,
  LEGACY_REGISTRIES,
  legacyEntriesIn,
  migrateLegacyRegistries,
  modelSetMarker,
} from './legacy-registries';
import { withoutSetEntries } from './strip-example';

const ROOT = path.join(__dirname, '..', '..');
const SCHEMA = readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');

function withoutAnnotations(schema: string): string {
  return schema
    .split('\n')
    .filter((line) => !line.trim().startsWith('/// @hery.'))
    .join('\n');
}

/**
 * A project that has not moved yet: its schema carries no annotation and its
 * kernel copy still lists every model, the way main did before this change.
 * The lists are rebuilt from the annotated schema, so the round trip proves
 * the migration lands back on exactly what the repository declares.
 */
function legacyProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'hery-legacy-'));
  const registries = registriesFrom(annotatedModelsIn(SCHEMA));
  const byFile = new Map<string, string[]>();

  for (const registry of LEGACY_REGISTRIES) {
    const entries = [...registries[registry.annotation]].map(
      (entry) =>
        `${registry.reason ? `  // carried over for ${entry}\n` : ''}  '${entry}',`,
    );
    const declaration = `${modelSetMarker(registry.set)}\n${entries.join('\n')}\n]);\n`;
    byFile.set(registry.file, [
      ...(byFile.get(registry.file) ?? []),
      declaration,
    ]);
  }

  for (const [file, declarations] of byFile) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), declarations.join('\n'));
  }

  mkdirSync(path.join(root, 'prisma'));
  writeFileSync(
    path.join(root, 'prisma', 'schema.prisma'),
    withoutAnnotations(SCHEMA),
  );

  return root;
}

describe('kernel:migrate, registries', () => {
  it('turns every legacy list into the annotations the repository declares', () => {
    const root = legacyProject();

    expect(
      migrateLegacyRegistries(root, { write: true }).length,
    ).toBeGreaterThan(0);

    const migrated = readFileSync(
      path.join(root, 'prisma', 'schema.prisma'),
      'utf8',
    );
    const expected = registriesFrom(annotatedModelsIn(SCHEMA));

    expect(registriesFrom(annotatedModelsIn(migrated))).toEqual(expected);
    expect(migrated).toContain(
      '/// @hery.appEnforcedTenant carried over for User\nmodel User {',
    );
  });

  it('is safe to run again', () => {
    const root = legacyProject();
    migrateLegacyRegistries(root, { write: true });
    const once = readFileSync(
      path.join(root, 'prisma', 'schema.prisma'),
      'utf8',
    );

    expect(migrateLegacyRegistries(root, { write: true })).toEqual([]);
    expect(
      readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8'),
    ).toBe(once);
  });

  it('writes nothing under --check', () => {
    const root = legacyProject();
    const before = readFileSync(
      path.join(root, 'prisma', 'schema.prisma'),
      'utf8',
    );

    expect(
      migrateLegacyRegistries(root, { write: false }).length,
    ).toBeGreaterThan(0);
    expect(
      readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8'),
    ).toBe(before);
  });

  it('does nothing in a project that has no legacy list', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'hery-legacy-'));
    mkdirSync(path.join(root, 'prisma'));
    writeFileSync(path.join(root, 'prisma', 'schema.prisma'), SCHEMA);

    expect(migrateLegacyRegistries(root, { write: true })).toEqual([]);
  });
});

describe('legacyEntriesIn', () => {
  it('carries the comment above an entry over as its reason', () => {
    const source = `${modelSetMarker('TENANT_FREE_MODELS')}
  // Owned by better-auth's adapter.
  'Session',
  'Account',
  // Keyed by an outbox id.
  'OutboxReceipt',
]);`;

    expect(legacyEntriesIn(source, 'TENANT_FREE_MODELS')).toEqual([
      { name: 'Session', reason: "Owned by better-auth's adapter." },
      { name: 'Account', reason: "Owned by better-auth's adapter." },
      { name: 'OutboxReceipt', reason: 'Keyed by an outbox id.' },
    ]);
  });

  it('reads a list written on one line', () => {
    expect(
      legacyEntriesIn(
        "const AUDITED_MODELS = new Set<string>(['BlogPost', 'RecordShare']);",
        'AUDITED_MODELS',
      ).map((entry) => entry.name),
    ).toEqual(['BlogPost', 'RecordShare']);
  });

  /**
   * `hery new` used to empty these lists, and an emptied literal must keep
   * its element type or every `.has(model)` stops compiling.
   */
  it('still names the element type of a list emptied by withoutSetEntries', () => {
    const source = `${modelSetMarker('AUDITED_MODELS')}'BlogPost']);`;

    expect(
      withoutSetEntries(source, 'AUDITED_MODELS', new Set(['BlogPost'])),
    ).toContain(`${modelSetMarker('AUDITED_MODELS')}])`);
  });
});

describe('annotateModel and annotateField', () => {
  const schema = `/// A note.
model Note {
  id    String @id
  title String
}
`;

  it('adds the annotation under the existing documentation', () => {
    expect(annotateModel(schema, 'Note', 'audited')).toBe(`/// A note.
/// @hery.audited
model Note {
  id    String @id
  title String
}
`);
  });

  it('annotates a field at its indentation', () => {
    expect(annotateField(schema, 'Note', 'title', 'history')).toContain(
      '  /// @hery.history\n  title String',
    );
  });

  it('is a no-op once the annotation is there', () => {
    const once = annotateModel(schema, 'Note', 'tenantScoped');

    expect(annotateModel(once, 'Note', 'tenantScoped')).toBe(once);
    expect(
      annotateField(
        annotateField(schema, 'Note', 'title', 'encrypted'),
        'Note',
        'title',
        'encrypted',
      ),
    ).toBe(annotateField(schema, 'Note', 'title', 'encrypted'));
  });

  it('fails loudly on a model the schema does not declare', () => {
    expect(() => annotateModel(schema, 'Missing', 'audited')).toThrow(
      'Could not find "model Missing"',
    );
  });
});
