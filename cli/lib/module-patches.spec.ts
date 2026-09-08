import type { InstallContext, LoadedModule } from './module-definition';
import { missingMarks, recordPatches } from './module-patches';

function moduleInstalling(
  install: (context: InstallContext) => void | Promise<void>,
): LoadedModule {
  return {
    name: 'probe',
    description: 'a module',
    dest: 'src/modules/probe',
    channel: 'official',
    packageDir: '/nowhere/packages/probe',
    install,
  } as LoadedModule;
}

const SCHEMA = [
  'model User {',
  '  id    String @id',
  '  email String @unique',
  '  role  String @default("member")',
  '}',
  '',
  'model Post {',
  '  id    String @id',
  '  title String',
  '}',
].join('\n');

describe('recording what a module patches', () => {
  it('records every replacement an exact patch writes', async () => {
    const records = await recordPatches(
      moduleInstalling((context) => {
        context.patchExactStrings(
          'src/technical/auth/better-auth.instance.ts',
          [
            ['plugins: [', 'plugins: [\n    admin(),'],
            ["from 'better-auth'", "from 'better-auth'\nimport { admin }"],
          ],
          'admin()',
        );
      }),
    );

    expect(records).toEqual([
      {
        module: 'probe',
        file: 'src/technical/auth/better-auth.instance.ts',
        marks: [
          'plugins: [\n    admin(),',
          "from 'better-auth'\nimport { admin }",
        ],
      },
    ]);
  });

  it('records the marker a guarded edit guards on', async () => {
    const records = await recordPatches(
      moduleInstalling((context) => {
        context.patch(
          'src/app.module.ts',
          'WebhooksModule',
          (source) => source,
        );
      }),
    );

    expect(records).toEqual([
      {
        module: 'probe',
        file: 'src/app.module.ts',
        marks: ['WebhooksModule'],
      },
    ]);
  });

  // A field line is `name Type @attrs` and prisma format realigns the columns
  // of the whole block whenever anything in it changes, so the name is the only
  // part of the line that survives being written.
  it('records only the field name of a Prisma patch', async () => {
    const records = await recordPatches(
      moduleInstalling((context) => {
        context.patchModelFields('prisma/schema.prisma', 'User', [
          '  role      String   @default("member")',
          '  lastSeenAt DateTime?',
        ]);
      }),
    );

    expect(records).toEqual([
      {
        module: 'probe',
        file: 'prisma/schema.prisma',
        model: 'User',
        marks: ['role'],
      },
    ]);
  });

  it('records nothing for the methods that only copy files', async () => {
    const records = await recordPatches(
      moduleInstalling((context) => {
        context.copyRuntime();
        context.copyPackageFile('docker-compose.probe.yml');
        context.nextSteps(['Import ProbeModule']);
      }),
    );

    expect(records).toEqual([]);
  });

  it('waits for an install that is asynchronous', async () => {
    const records = await recordPatches(
      moduleInstalling(async (context) => {
        await Promise.resolve();
        context.patch('src/app.module.ts', 'ProbeModule', (source) => source);
      }),
    );

    expect(records).toHaveLength(1);
  });
});

describe('the marks a module left', () => {
  function read(files: Record<string, string>) {
    return (file: string) => files[file];
  }

  it('says nothing when every mark is still there', () => {
    const records = [
      { module: 'probe', file: 'a.ts', marks: ['const answer = 42;'] },
    ];

    expect(
      missingMarks(records, read({ 'a.ts': 'const answer = 42;\n' })),
    ).toEqual([]);
  });

  /**
   * The failure this exists for: patchExactStrings throws only when its guard
   * is absent, so on a project already carrying the guard a search string the
   * kernel has moved past makes the whole patch a no-op reported as "already
   * patched". Nothing else here compares a patched kernel file to anything.
   */
  it('reports a patch the kernel file no longer holds', () => {
    const records = [
      {
        module: 'impersonation',
        file: 'env-schema.ts',
        marks: ['RLS_ENABLED: z\nIMPERSONATION_SESSION_SECONDS: z.coerce'],
      },
    ];

    expect(
      missingMarks(records, read({ 'env-schema.ts': 'RLS_ENABLED: z\n' })),
    ).toEqual([
      'impersonation patches env-schema.ts, and what it writes is not there: "IMPERSONATION_SESSION_SECONDS: z.coerce"',
    ]);
  });

  // A replacement is mostly the lines it anchors on, and those are still in
  // the file -- quoting them back would send the reader to the half that works.
  it('quotes the first line the file does not hold', () => {
    const records = [
      {
        module: 'probe',
        file: 'a.ts',
        marks: ['plugins: [\n  admin(),\n  organization(),'],
      },
    ];

    expect(
      missingMarks(records, read({ 'a.ts': 'plugins: [\n  admin(),\n]' })),
    ).toEqual([
      'probe patches a.ts, and what it writes is not there: "organization(),"',
    ]);
  });

  it('reports a file that is not there at all', () => {
    const records = [{ module: 'probe', file: 'gone.ts', marks: ['anything'] }];

    expect(missingMarks(records, read({}))).toEqual([
      'probe patches gone.ts, which is not there',
    ]);
  });

  it('finds a field whose columns prisma format has realigned', () => {
    const records = [
      {
        module: 'probe',
        file: 'schema.prisma',
        model: 'User',
        marks: ['role'],
      },
    ];

    expect(missingMarks(records, read({ 'schema.prisma': SCHEMA }))).toEqual(
      [],
    );
  });

  // Scoped to the model block, because a field name is a common word: `title`
  // sitting on Post says nothing about whether User ever received it.
  it('does not accept a field found on another model', () => {
    const records = [
      {
        module: 'probe',
        file: 'schema.prisma',
        model: 'User',
        marks: ['title'],
      },
    ];

    expect(missingMarks(records, read({ 'schema.prisma': SCHEMA }))).toEqual([
      'probe patches schema.prisma, and what it writes is not there: "title"',
    ]);
  });

  it('reports a model the schema does not define', () => {
    const records = [
      {
        module: 'probe',
        file: 'schema.prisma',
        model: 'Invoice',
        marks: ['total'],
      },
    ];

    expect(missingMarks(records, read({ 'schema.prisma': SCHEMA }))).toEqual([
      'probe patches model Invoice in schema.prisma, which holds no such model',
    ]);
  });
});
