import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  addModelFields,
  addPrismaModels,
  modelNamesIn,
  patchModelSet,
} from './schema-patch';

const SCHEMA = [
  'model User {',
  '  id        String   @id',
  '  email     String   @unique',
  '  createdAt DateTime @default(now())',
  '',
  '  posts Post[]',
  '}',
  '',
  'model Post {',
  '  id    String @id',
  '  title String',
  '}',
  '',
].join('\n');

const PROBE_MODELS = [
  '',
  'model ProbeLog {',
  '  id       String @id',
  '  tenantId String',
  '}',
  '',
].join('\n');

describe('appending models a module owns', () => {
  let schema: string;

  beforeEach(() => {
    schema = path.join(
      mkdtempSync(path.join(tmpdir(), 'hery-schema-')),
      'schema.prisma',
    );
    writeFileSync(schema, SCHEMA);
  });

  it('adds the block at the end, separated by a blank line', () => {
    expect(addPrismaModels(schema, PROBE_MODELS)).toBe(true);
    expect(readFileSync(schema, 'utf8')).toBe(
      `${SCHEMA.trimEnd()}\n${PROBE_MODELS}`,
    );
  });

  it('does nothing when one of those models is already declared', () => {
    addPrismaModels(schema, PROBE_MODELS);

    expect(addPrismaModels(schema, PROBE_MODELS)).toBe(false);
  });

  // Two models appended together are one patch: finding either of them means
  // the append already happened, and adding the other alone would leave the
  // schema half-patched.
  it('does nothing when only the second model is already there', () => {
    const twoModels = `${PROBE_MODELS}\nmodel ProbeEvent {\n  id String @id\n}\n`;
    writeFileSync(
      schema,
      `${SCHEMA}\nmodel ProbeEvent {\n  id String @id\n}\n`,
    );

    expect(addPrismaModels(schema, twoModels)).toBe(false);
  });

  it('refuses a block declaring no model at all', () => {
    expect(() => addPrismaModels(schema, '// just a comment\n')).toThrow(
      'no model block',
    );
  });

  it('reads every model name out of a block', () => {
    expect(
      modelNamesIn('model A {\n}\n\nmodel  B  {\n}\nnot a model\n'),
    ).toEqual(['A', 'B']);
  });
});

describe('adding fields to a model a module does not own', () => {
  let schema: string;

  beforeEach(() => {
    schema = path.join(
      mkdtempSync(path.join(tmpdir(), 'hery-schema-')),
      'schema.prisma',
    );
    writeFileSync(schema, SCHEMA);
  });

  // Timestamps are the last scalars before the relations, so a new scalar goes
  // in front of them rather than after the relation block.
  it('inserts before the timestamps', () => {
    addModelFields(schema, 'User', ['  role String?']);

    expect(readFileSync(schema, 'utf8')).toContain(
      '  email     String   @unique\n  role String?\n  createdAt',
    );
  });

  it('does nothing when the first field is already there', () => {
    addModelFields(schema, 'User', ['  role String?']);

    expect(addModelFields(schema, 'User', ['  role String?'])).toBe(false);
  });

  it('refuses a model the schema does not declare', () => {
    expect(() => addModelFields(schema, 'Invoice', ['  total Int'])).toThrow(
      'Could not find "model Invoice"',
    );
  });

  it('refuses being given no field at all', () => {
    expect(() => addModelFields(schema, 'User', [])).toThrow('no field lines');
  });
});

describe('patchModelSet', () => {
  let file: string;

  function registry(body: string): string {
    return `const SET = new Set<string>([${body}]);\n`.replace(
      'SET',
      'TENANT_SCOPED_MODELS',
    );
  }

  function patched(body: string): string {
    file = path.join(mkdtempSync(path.join(tmpdir(), 'hery-set-')), 'set.ts');
    writeFileSync(file, registry(body));
    patchModelSet(file, 'TENANT_SCOPED_MODELS', 'Note');

    return readFileSync(file, 'utf8');
  }

  function names(source: string): string[] {
    return [...source.matchAll(/'(\w+)'/g)].map((match) => match[1] ?? '');
  }

  it('appends to a list written on one line', () => {
    expect(names(patched("'Team', 'Tag'"))).toEqual(['Team', 'Tag', 'Note']);
  });

  it('appends to an empty list', () => {
    expect(names(patched(''))).toEqual(['Note']);
  });

  it('appends after a trailing comma without leaving an array hole', () => {
    const source = patched("\n  'Team',\n  'Tag',\n");

    expect(names(source)).toEqual(['Team', 'Tag', 'Note']);
    expect(source).not.toMatch(/,\s*,/);
  });

  it('is a no-op when the model is already listed', () => {
    const source = patched("'Note'");

    expect(names(source)).toEqual(['Note']);
  });
});
