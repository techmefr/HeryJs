import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { workspaceModules } from '../lib/module-runtime-copies';
import {
  COPY_ENTRIES,
  DOC_EXAMPLES_STEP,
  MODULES_THE_KERNEL_NEEDS,
  projectManifest,
  projectWorkflow,
  withoutKernelDependency,
} from './new';

describe('the CI workflow a generated project starts from', () => {
  const workflow = projectWorkflow(
    readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '.github',
        'workflows',
        'ci.yml',
      ),
      'utf8',
    ),
  );

  it('fails on a kernel schema left behind before the migration step rewrites it', () => {
    const check = workflow.indexOf('pnpm hery sync --check');

    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(
      workflow.indexOf('pnpm exec prisma migrate deploy'),
    );
  });

  it('fails on a schema change the committed migrations do not carry', () => {
    expect(workflow).not.toContain('hery migrate --name ci');
    expect(workflow).toContain(
      'pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --exit-code',
    );
    expect(workflow).toContain('SHADOW_DATABASE_URL:');
  });
});

const REPO_MANIFEST = JSON.parse(
  readFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'package.json'),
    'utf8',
  ),
) as Record<string, unknown>;

describe('the manifest a generated project starts from', () => {
  function generated() {
    return projectManifest(REPO_MANIFEST, 'my-app') as unknown as Record<
      string,
      unknown
    >;
  }

  it('takes the name the developer typed', () => {
    expect(generated().name).toBe('my-app');
    expect(generated().description).toBe('A HeryJs project.');
  });

  /**
   * Read from this repository's real manifest rather than a fixture, so a
   * field added here is a field this test sees. Every one of them names the
   * framework, and a project publishing its own package would offer HeryJs's
   * repository, issue tracker and author to the registry as its own.
   */
  it.each([
    'author',
    'bin',
    'bugs',
    'files',
    'homepage',
    'keywords',
    'license',
    'repository',
  ])('does not inherit the framework field %s', (field) => {
    expect(REPO_MANIFEST[field]).toBeDefined();
    expect(generated()[field]).toBeUndefined();
  });

  // The kernel version a project was generated from travels in
  // cli/lib/kernel-version.ts; the number in package.json is the project's.
  it('starts at its own first version, not the kernel release', () => {
    expect(generated().version).toBe('0.0.1');
    expect(generated().version).not.toBe(REPO_MANIFEST.version);
  });

  /**
   * Declared by the scaffolder, not inherited: this repository's manifest is
   * published, so `private` stopped travelling with it. An application that
   * publishes itself by accident publishes its whole source.
   */
  it('keeps the project private, which the framework no longer is', () => {
    expect(generated().private).toBe(true);
    expect(REPO_MANIFEST.private).toBeUndefined();
  });

  /**
   * The framework cannot carry this one: as a lifecycle script it runs inside
   * whoever installs the published package, where prisma is not resolvable,
   * and it failed the install before the scaffolder was ever reached. A
   * project does need it on every install.
   */
  it('regenerates the Prisma client on install, which the framework does not', () => {
    expect(
      (REPO_MANIFEST.scripts as Record<string, string>).postinstall,
    ).toBeUndefined();
    expect((generated().scripts as Record<string, string>).postinstall).toBe(
      'prisma generate',
    );
  });

  /**
   * `hery new` deletes both checks from the project's registry, so leaving
   * their shortcuts behind would offer a script that fails on a name the
   * runner no longer knows. Each asks a question only this repository can
   * answer: the demo against the generator that produced it, and the manifest
   * against the kernel constant -- equal in a release, and deliberately not in
   * a project, whose manifest carries its own version.
   */
  it.each(['lint:example', 'lint:kernel-version'])(
    'drops %s, whose check does not survive the copy',
    (script) => {
      expect(
        (REPO_MANIFEST.scripts as Record<string, string>)[script],
      ).toBeDefined();
      expect(
        (generated().scripts as Record<string, string>)[script],
      ).toBeUndefined();
    },
  );

  it('runs its conventions with hery check and no script reaches for scripts/', () => {
    const scripts = generated().scripts as Record<string, string>;

    expect(scripts.check).toBe('pnpm hery check');
    expect(
      Object.entries(scripts).filter(
        ([, command]) =>
          command.includes('scripts/') || command.includes('lint:conventions'),
      ),
    ).toEqual([]);
  });

  /**
   * The CLI ships in @heryjs/cli. Copied, it stayed at the version the
   * project was generated from: `hery upgrade` took the project for the
   * framework, and a project migrated later had no `hery check` at all.
   */
  it('runs hery from the installed @heryjs/cli, with no copy of the CLI', () => {
    const scripts = generated().scripts as Record<string, string>;

    expect(COPY_ENTRIES).not.toContain('cli');
    expect(scripts.hery).toMatch(/(^| )hery$/);
    expect(scripts['lint:hery']).toMatch(/(^| )hery lint --min-score 100$/);
    expect(
      Object.values(scripts).filter((command) => command.includes('hery.ts')),
    ).toEqual([]);
  });

  it('copies the database role script, not the framework check scripts', () => {
    expect(COPY_ENTRIES).toContain('scripts/postgres');
    expect(COPY_ENTRIES).not.toContain('scripts');
  });

  // Both assume something a fresh project does not have: an examples/
  // directory, and this repository's own admin/ and docs/ workspaces.
  it('lints only what a project has around it', () => {
    const scripts = generated().scripts as Record<string, string>;

    expect(scripts.lint).not.toContain('examples');
    expect(scripts.lint).not.toContain('pnpm --filter admin');
  });

  it('fails lint on any warning, as this repository does', () => {
    const scripts = generated().scripts as Record<string, string>;

    expect(scripts.lint).toContain('--max-warnings 0');
  });

  it('checks formatting in lint and fixes it only in lint:fix', () => {
    const scripts = generated().scripts as Record<string, string>;

    expect(scripts.lint).not.toContain('--fix');
    expect(scripts['lint:fix']).toBe(`${scripts.lint} --fix`);
  });

  it('drops docs:examples, which captures examples/blog-post', () => {
    expect(
      (REPO_MANIFEST.scripts as Record<string, string>)['docs:examples'],
    ).toBeDefined();
    expect(
      (generated().scripts as Record<string, string>)['docs:examples'],
    ).toBeUndefined();
    expect(
      readFileSync(
        path.join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          '.github/workflows/ci.yml',
        ),
        'utf8',
      ),
    ).toContain(DOC_EXAMPLES_STEP);
  });

  it('runs its suite over its own src only', () => {
    expect((generated().jest as { roots: string[] }).roots).toEqual([
      '<rootDir>/src',
    ]);
  });

  // Not only the fields at the top: a shallow copy shares `scripts` and
  // `jest`, and every edit below them reached back into the source.
  it('leaves the source manifest alone, nested objects included', () => {
    const before = JSON.stringify(REPO_MANIFEST);

    projectManifest(REPO_MANIFEST, 'my-app');

    expect(JSON.stringify(REPO_MANIFEST)).toBe(before);
  });
});

/**
 * Read from a real module's manifest: a project renames the root package, and
 * `heryjs@workspace:*` then names a member pnpm cannot find.
 */
describe('a module manifest inside a generated project', () => {
  const MAIL_MANIFEST = JSON.parse(
    readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'packages',
        'mail',
        'package.json',
      ),
      'utf8',
    ),
  ) as Record<string, Record<string, string>>;

  it('no longer depends on the kernel by workspace name', () => {
    expect(MAIL_MANIFEST.devDependencies?.heryjs).toBe('workspace:*');

    const rewritten = withoutKernelDependency(MAIL_MANIFEST) as Record<
      string,
      Record<string, string>
    >;

    expect(rewritten.devDependencies?.heryjs).toBeUndefined();
    expect(rewritten.devDependencies?.typescript).toBeDefined();
  });
});

describe('the modules a fresh project keeps', () => {
  it.each(Object.entries(MODULES_THE_KERNEL_NEEDS))(
    '%s is installed here and says why the kernel needs it',
    (name, reason) => {
      expect(
        workspaceModules(
          (REPO_MANIFEST as { dependencies?: Record<string, string> })
            .dependencies,
        ),
      ).toContain(name);
      expect(
        existsSync(
          path.join(
            __dirname,
            '..',
            '..',
            '..',
            '..',
            'packages',
            name,
            'src',
            'runtime',
          ),
        ),
      ).toBe(true);
      expect(reason.length).toBeGreaterThan(0);
    },
  );
});

describe('the production build of a generated project', () => {
  const REPO_ROOT = path.join(__dirname, '..', '..');
  const BUILD_ONLY = ['ts-node', 'typescript', 'pino-pretty'];

  function readJson<T>(...segments: string[]): T {
    return JSON.parse(
      readFileSync(path.join(REPO_ROOT, ...segments), 'utf8'),
    ) as T;
  }

  it('compiles hery.config.ts and cors.config.ts with the application', () => {
    const { include } = readJson<{ include: string[] }>('tsconfig.build.json');

    expect(include).toEqual(
      expect.arrayContaining(['hery.config.ts', 'cors.config.ts']),
    );
  });

  it.each(BUILD_ONLY)('keeps %s out of the production dependencies', (name) => {
    const manifest = projectManifest(REPO_MANIFEST, 'my-app') as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(manifest.dependencies?.[name]).toBeUndefined();
    expect(manifest.devDependencies?.[name]).toBeDefined();
  });

  it.each(BUILD_ONLY)('does not require %s as a peer of the kernel', (name) => {
    const core = readJson<{
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    }>('packages', 'core', 'package.json');

    expect(core.peerDependenciesMeta?.[name]?.optional).toBe(true);
  });

  it('ships an image without the dev dependencies or the TypeScript config', () => {
    const dockerfile = readFileSync(
      path.join(REPO_ROOT, 'templates', 'Dockerfile'),
      'utf8',
    );
    const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));

    expect(dockerfile).toContain('pnpm prune --prod');
    expect(runtime).not.toMatch(/\.config\.ts|tsconfig\.json/);
    expect(runtime).not.toContain(
      '--from=build --chown=node:node /app/node_modules',
    );
  });
});
