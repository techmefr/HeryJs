import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  stripModelsFromSchemaFolder,
  withoutSetEntries,
} from './strip-example';

const REGISTRY = `export const TENANT_FREE_MODELS = new Set<string>([
  // better-auth's own tables, read through its own adapter.
  'Account',
  'Session',
  // The sso module's tables.
  'SsoConnection',
  'SsoDomain',
]);
`;

describe('withoutSetEntries on a registry written one entry per line', () => {
  it('removes only the lines of the removed entries, comments with apostrophes included', () => {
    expect(
      withoutSetEntries(
        REGISTRY,
        'TENANT_FREE_MODELS',
        new Set(['SsoConnection', 'SsoDomain']),
      ),
    ).toBe(`export const TENANT_FREE_MODELS = new Set<string>([
  // better-auth's own tables, read through its own adapter.
  'Account',
  'Session',
  // The sso module's tables.
]);
`);
  });

  it('keeps the layout a module patch anchors on', () => {
    expect(
      withoutSetEntries(REGISTRY, 'TENANT_FREE_MODELS', new Set(['SsoDomain'])),
    ).toContain("new Set<string>([\n  // better-auth's own tables");
  });

  it('empties to a typed Set once no entry is left', () => {
    expect(
      withoutSetEntries(
        REGISTRY,
        'TENANT_FREE_MODELS',
        new Set(['Account', 'Session', 'SsoConnection', 'SsoDomain']),
      ),
    ).toContain('new Set<string>([])');
  });
});

describe('stripModelsFromSchemaFolder', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'hery-strip-folder-'));
    mkdirSync(path.join(root, 'prisma', 'schema', '_hery'), {
      recursive: true,
    });
    writeFileSync(
      path.join(root, 'prisma', 'schema', '_hery', 'core.prisma'),
      'datasource db {\n  provider = "postgresql"\n}\n\nmodel User {\n  id String @id\n\n  blogPosts BlogPost[]\n  logs      ProbeLog[]\n}\n',
    );
    writeFileSync(
      path.join(root, 'prisma', 'schema', 'app.prisma'),
      'model BlogPost {\n  id String @id\n\n  tags BlogPostTag[]\n}\n\nmodel BlogPostTag {\n  id String @id\n}\n',
    );
    writeFileSync(
      path.join(root, 'prisma', 'schema', 'probe.prisma'),
      'model ProbeLog {\n  id String @id\n}\n',
    );
  });

  // The back-relation sits in the kernel's file while the model sits in the
  // project's, so stripping file by file would leave User pointing at nothing.
  it('removes the models from their file and their back-relations from the others', () => {
    expect(
      stripModelsFromSchemaFolder(root, new Set(['BlogPost'])).sort(),
    ).toEqual(['BlogPost', 'BlogPostTag']);

    const core = readFileSync(
      path.join(root, 'prisma', 'schema', '_hery', 'core.prisma'),
      'utf8',
    );

    expect(core).not.toContain('blogPosts');
    expect(core).toContain('logs      ProbeLog[]');
  });

  it('deletes a file left without any block', () => {
    stripModelsFromSchemaFolder(root, new Set(['BlogPost', 'ProbeLog']));

    expect(existsSync(path.join(root, 'prisma', 'schema', 'app.prisma'))).toBe(
      false,
    );
    expect(
      existsSync(path.join(root, 'prisma', 'schema', 'probe.prisma')),
    ).toBe(false);
    expect(
      existsSync(path.join(root, 'prisma', 'schema', '_hery', 'core.prisma')),
    ).toBe(true);
  });
});
