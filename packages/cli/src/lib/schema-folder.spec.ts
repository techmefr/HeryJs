import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadOfficialModules } from './module-discovery';
import { recordModelFields, recordPatches } from './module-patches';
import {
  KERNEL_SCHEMA_SOURCE,
  kernelSchemaOf,
  migrateSchemaFolder,
  splitSchema,
  withMigrationsPath,
} from './schema-folder';
import { KERNEL_SCHEMA } from './schema-patch';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

const LEGACY = [
  '// This is your Prisma schema file,',
  '',
  'generator client {',
  '  provider = "prisma-client-js"',
  '}',
  '',
  'datasource db {',
  '  provider = "postgresql"',
  '}',
  '',
  '/// @hery.appEnforcedTenant Written by better-auth.',
  'model User {',
  '  id       String @id',
  '  tenantId String',
  '',
  '  posts Post[]',
  '  logs  ProbeLog[]',
  '}',
  '',
  '// The module owns this one.',
  '/// @hery.tenantScoped',
  'model ProbeLog {',
  '  id       String @id',
  '  tenantId String',
  '  userId   String',
  '',
  '  user User @relation(fields: [userId], references: [id])',
  '}',
  '',
  '/// @hery.tenantScoped',
  'model Post {',
  '  id       String @id',
  '  tenantId String',
  '  ownerId  String',
  '',
  '  owner User @relation(fields: [ownerId], references: [id])',
  '}',
  '',
  'enum Status {',
  '  draft',
  '  published',
  '}',
  '',
].join('\n');

const OWNERS = {
  kernel: new Set(['User']),
  files: new Map([['ProbeLog', 'prisma/schema/probe.prisma']]),
};

function normalised(schema: string): string[] {
  return schema
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '' && !line.startsWith('//'));
}

describe('splitting a single schema.prisma into the folder', () => {
  const parts = splitSchema(LEGACY, OWNERS);

  it('gives the generators, the datasource and the kernel models to _hery/', () => {
    const kernel = parts.get(KERNEL_SCHEMA) ?? '';

    expect(kernel).toContain('generator client {');
    expect(kernel).toContain('datasource db {');
    expect(kernel).toContain('model User {');
    expect(kernel).not.toContain('model Post {');
  });

  it('gives each module its own file, comments and annotations included', () => {
    expect(parts.get('prisma/schema/probe.prisma')).toBe(
      [
        '// The module owns this one.',
        '/// @hery.tenantScoped',
        'model ProbeLog {',
        '  id       String @id',
        '  tenantId String',
        '  userId   String',
        '',
        '  user User @relation(fields: [userId], references: [id])',
        '}',
        '',
      ].join('\n'),
    );
  });

  it("leaves the rest, enums included, to the project's app.prisma", () => {
    const app = parts.get('prisma/schema/app.prisma') ?? '';

    expect(app).toContain('model Post {');
    expect(app).toContain('enum Status {');
    expect(app).not.toContain('model ProbeLog {');
  });

  it('loses no line on the way', () => {
    const joined = [...parts.values()].join('\n');

    expect(normalised(joined).sort()).toEqual(normalised(LEGACY).sort());
    expect(joined).toContain('// This is your Prisma schema file,');
  });
});

describe("the kernel's own schema", () => {
  // packages/core ships the kernel's models without what this repository's
  // modules and demo hang on them, so it has to follow every change to
  // _hery/core.prisma rather than drift from it.
  it("is this repository's _hery/core.prisma without what modules and the demo add", async () => {
    const added = new Set<string>();

    for (const module of loadOfficialModules()) {
      for (const write of await recordModelFields(module)) {
        write.fields.forEach((line) => added.add(line.trim().split(/\s+/)[0]!));
      }
    }

    const derived = kernelSchemaOf(
      readFileSync(path.join(ROOT, KERNEL_SCHEMA), 'utf8'),
      added,
    );

    expect(normalised(derived)).toEqual(
      normalised(readFileSync(path.join(ROOT, KERNEL_SCHEMA_SOURCE), 'utf8')),
    );
  });

  it('drops the back-relations to models it does not declare, and the added fields', () => {
    const kernel = splitSchema(LEGACY, OWNERS).get(KERNEL_SCHEMA) ?? '';
    const derived = kernelSchemaOf(kernel, new Set(['tenantId']));

    expect(derived).toContain('model User {');
    expect(derived).toContain('id       String @id');
    expect(derived).not.toContain('posts Post[]');
    expect(derived).not.toContain('logs  ProbeLog[]');
    expect(derived).not.toContain('tenantId String');
  });
});

describe("this repository's schema folder", () => {
  it('holds every model a module installs in that module’s own file', async () => {
    for (const module of loadOfficialModules()) {
      for (const record of await recordPatches(module)) {
        if (!record.file.endsWith('.prisma')) {
          continue;
        }

        const source = readFileSync(path.join(ROOT, record.file), 'utf8');

        record.marks.forEach((mark) => expect(source).toContain(mark));
      }
    }
  });
});

describe('moving a project onto the schema folder', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-schema-folder-'));
    mkdirSync(path.join(root, 'prisma'));
    writeFileSync(path.join(root, 'prisma', 'schema.prisma'), LEGACY);
    writeFileSync(
      path.join(root, 'prisma.config.ts'),
      "export default defineConfig({\n  schema: 'prisma/schema.prisma',\n  migrations: {\n    seed: 'ts-node prisma/seed.ts',\n  },\n});\n",
    );
    writeFileSync(
      path.join(root, 'package.json'),
      '{\n  "files": ["prisma/schema.prisma"]\n}\n',
    );
  });

  it('lists what it would change and writes nothing under --check', () => {
    expect(migrateSchemaFolder(root, OWNERS, { write: false })).toEqual([
      'prisma/schema.prisma',
      KERNEL_SCHEMA,
      'prisma/schema/probe.prisma',
      'prisma/schema/app.prisma',
      'prisma.config.ts',
      'package.json',
    ]);
    expect(existsSync(path.join(root, 'prisma', 'schema.prisma'))).toBe(true);
    expect(existsSync(path.join(root, 'prisma', 'schema'))).toBe(false);
  });

  it('writes the folder, removes schema.prisma and points the config at both folders', () => {
    migrateSchemaFolder(root, OWNERS, { write: true });

    expect(existsSync(path.join(root, 'prisma', 'schema.prisma'))).toBe(false);
    expect(readFileSync(path.join(root, KERNEL_SCHEMA), 'utf8')).toContain(
      'model User {',
    );
    expect(
      readFileSync(path.join(root, 'prisma/schema/probe.prisma'), 'utf8'),
    ).toContain('model ProbeLog {');

    const config = readFileSync(path.join(root, 'prisma.config.ts'), 'utf8');

    expect(config).toContain("schema: 'prisma/schema',");
    expect(config).toContain("path: 'prisma/migrations',");
    expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toContain(
      '"prisma/schema"',
    );
  });

  it('is a no-op the second time', () => {
    migrateSchemaFolder(root, OWNERS, { write: true });

    expect(migrateSchemaFolder(root, OWNERS, { write: true })).toEqual([]);
  });
});

describe('naming the migrations folder in prisma.config.ts', () => {
  it('adds the path to an existing migrations block', () => {
    expect(
      withMigrationsPath(
        "  schema: 'prisma/schema',\n  migrations: {\n    seed: 'x',\n  },\n",
      ),
    ).toBe(
      "  schema: 'prisma/schema',\n  migrations: {\n    path: 'prisma/migrations',\n    seed: 'x',\n  },\n",
    );
  });

  it('adds a migrations block when there is none', () => {
    expect(withMigrationsPath("  schema: 'prisma/schema',\n")).toBe(
      "  schema: 'prisma/schema',\n  migrations: { path: 'prisma/migrations' },\n",
    );
  });

  it('keeps a path the project already chose', () => {
    const config = "  migrations: {\n    path: 'db/migrations',\n  },\n";

    expect(withMigrationsPath(config)).toBe(config);
  });
});
