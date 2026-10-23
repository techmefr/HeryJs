import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  addModelFields,
  addPrismaModels,
  modelNamesIn,
  removeModelFields,
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

describe("writing a module's models into a file of its own", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'hery-schema-folder-'));
  });

  it('creates the file on the first install', () => {
    const file = path.join(dir, 'modules', 'probe.prisma');

    expect(addPrismaModels(file, PROBE_MODELS)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(PROBE_MODELS.trimStart());
  });

  // The module's own file is new, so the guard has to look at the rest of the
  // schema: a model the project already declares elsewhere would be declared
  // twice, which Prisma refuses for the whole folder.
  it('does nothing when another file of the schema already declares one of its models', () => {
    const file = path.join(dir, 'probe.prisma');

    expect(
      addPrismaModels(
        file,
        PROBE_MODELS,
        'model ProbeLog {\n  id String @id\n}\n',
      ),
    ).toBe(false);
    expect(existsSync(file)).toBe(false);
  });
});

describe('taking back the fields a module added', () => {
  let schema: string;

  beforeEach(() => {
    schema = path.join(
      mkdtempSync(path.join(tmpdir(), 'hery-schema-')),
      'schema.prisma',
    );
    writeFileSync(schema, SCHEMA);
  });

  it('removes exactly the lines it wrote, however prisma format realigned them', () => {
    addModelFields(schema, 'User', ['  role String?', '  banned Boolean']);
    writeFileSync(
      schema,
      readFileSync(schema, 'utf8').replace(
        '  role String?',
        '  role      String?',
      ),
    );

    expect(
      removeModelFields(schema, 'User', ['  role String?', '  banned Boolean']),
    ).toBe(true);
    expect(readFileSync(schema, 'utf8')).toBe(SCHEMA);
  });

  it('leaves the other models alone, even with a field of the same name', () => {
    expect(removeModelFields(schema, 'User', ['  title String'])).toBe(false);
    expect(readFileSync(schema, 'utf8')).toBe(SCHEMA);
  });

  it('does nothing on a model the file does not declare', () => {
    expect(removeModelFields(schema, 'Invoice', ['  total Int'])).toBe(false);
  });
});
