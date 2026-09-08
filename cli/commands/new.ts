import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { loadBlueprint } from '../lib/blueprint';
import { frameworkRoot } from '../lib/framework-root';
import { MODEL_REGISTRIES } from '../lib/model-set';
import { pascalCase } from '../lib/naming';
import { stripModelsFromSchema, withoutSetEntries } from '../lib/strip-example';

const REPO_ROOT = frameworkRoot();

/**
 * Everything a fresh project needs to run `hery generate`/`hery install` on
 * its own: the CLI itself, every module's authoring package, the kernel
 * (technical/), the always-there DX tools (devtools/), the modules already
 * wired into AppModule by default (modules/), and the config each of those
 * depends on. Deliberately excluded: examples/ and docs/ (this framework's
 * own demo and doc site, not part of what ships), admin/ (installed later via
 * `hery install admin-astro`, same as any other opt-in module), and anything
 * that is this repository's own build/dev state (node_modules, dist, the
 * lockfile, .git, .env).
 */
export const COPY_ENTRIES = [
  'cli',
  'packages',
  'scripts',
  'src/technical',
  'src/devtools',
  'src/modules',
  'src/functional',
  'src/app.controller.ts',
  'src/app.controller.spec.ts',
  'src/app.module.ts',
  'src/app.service.ts',
  'src/main.ts',
  'test',
  '.github',
  'prisma/schema.prisma',
  'prisma.config.ts',
  'hery.config.ts',
  'cors.config.ts',
  '.dependency-cruiser.cjs',
  'tsconfig.json',
  'tsconfig.build.json',
  'tsconfig.depcruise.json',
  'nest-cli.json',
  'eslint.config.mjs',
  '.oxlintrc.json',
  '.prettierrc',
  '.env.example',
  '.nvmrc',
  'docker-compose.yml',
  'docker-compose.storage.yml',
  'docker-compose.stream.yml',
  'Caddyfile',
  'package.json',
  'pnpm-workspace.yaml',
];

/**
 * The two convention checks that do not survive the copy, because each one
 * asks a question only this repository can answer.
 *
 * `example-freshness` compares the demo against the generator that produced
 * it, and a fresh project ships no examples/ at all. `kernel-version` holds
 * package.json and cli/lib/kernel-version.ts to the same number, which is
 * true of a release and false of a project: the manifest carries the
 * project's own version, and the constant carries the kernel it came from.
 */
const CHECKS_THIS_REPOSITORY_OWNS = [
  {
    name: 'example-freshness',
    file: 'check-example-freshness',
    symbol: 'checkExampleFreshness',
    script: 'lint:example',
  },
  {
    name: 'kernel-version',
    file: 'check-kernel-version',
    symbol: 'checkKernelVersion',
    script: 'lint:kernel-version',
  },
];

function dropChecksThisRepositoryOwns(destRoot: string): void {
  const registry = path.join(destRoot, 'scripts/check-conventions.ts');
  let source = readFileSync(registry, 'utf8');

  for (const check of CHECKS_THIS_REPOSITORY_OWNS) {
    rmSync(path.join(destRoot, 'scripts', `${check.file}.ts`));

    const importLine = `import { ${check.symbol} } from './${check.file}';\n`;
    const registration = `  { name: '${check.name}', run: ${check.symbol} },\n`;

    if (!source.includes(importLine) || !source.includes(registration)) {
      throw new Error(
        `scripts/check-conventions.ts no longer registers ${check.name} the way "hery new" removes it.`,
      );
    }

    source = source.replace(importLine, '').replace(registration, '');
  }

  writeFileSync(registry, source);
}

/**
 * Two kernel specs need a real resource to exercise (introspection/inspector
 * both introspect whatever routes exist) and reach for examples/blog-post for
 * one, since this repository always has it. A fresh project has no resource
 * yet, and does not need to re-prove that introspection works with one —
 * that is this framework's own test suite's job, not a downstream project's.
 */
function dropSpecsThatNeedTheExample(destRoot: string): void {
  rmSync(
    path.join(destRoot, 'src/technical/introspection/introspection.spec.ts'),
  );
  rmSync(path.join(destRoot, 'src/devtools/inspector/inspector.spec.ts'));
}

function specFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return specFilesUnder(full);
    }

    return entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

/**
 * The kernel proves itself against a real model, and the only model this
 * repository has is the demo one -- thirteen specs write BlogPost rows to
 * exercise pruning, tenant scoping, the audit chain and the include resolver.
 * With the demo gone those specs cannot compile, and a downstream project has
 * no reason to re-prove the kernel: that is this repository's CI, not theirs.
 * Their own generated resources ship their own generated specs.
 */
function dropSpecsNamingRemovedModels(
  destRoot: string,
  removed: string[],
): number {
  if (removed.length === 0) {
    return 0;
  }

  // Deliberately a prefix match: a spec that imports BlogPostModule or types a
  // blogPostFactory is just as broken as one naming the model outright.
  const pattern = new RegExp(
    removed
      .flatMap((name) => [name, name.charAt(0).toLowerCase() + name.slice(1)])
      .map((name) => `\\b${name}[A-Za-z]*\\b`)
      .join('|'),
  );

  const doomed = specFilesUnder(path.join(destRoot, 'src')).filter((file) =>
    pattern.test(readFileSync(file, 'utf8')),
  );

  doomed.forEach((file) => rmSync(file));

  return doomed.length;
}

/**
 * The blueprints under examples/ are this repository's demo. Their models are
 * in the schema that gets copied, and their names are in the kernel's
 * tenant-scoped and audited sets, so a scaffolded project used to boot with a
 * BlogPost table, a Tag table and a pivot between them -- "generate your first
 * resource" against a schema that already had one.
 */
/**
 * The demo resources this repository generates for itself, read from the
 * blueprints that produced them -- which is why those blueprints are part of
 * the published payload even though the code generated from them is not.
 * Without them the strip below finds nothing and the demo's models stay in a
 * fresh project's schema, silently.
 *
 * Empty is a legitimate answer, and only for one payload: a generated project
 * is itself one, and has no demo to strip when `hery new` runs from inside it.
 */
function exampleModelNames(): Set<string> {
  const dir = path.join(REPO_ROOT, 'examples');

  if (!existsSync(dir)) {
    return new Set();
  }

  return new Set(
    readdirSync(dir)
      .filter((entry) => /\.ya?ml$/.test(entry))
      .map((entry) => pascalCase(loadBlueprint(path.join(dir, entry)).name)),
  );
}

function dropExampleModels(destRoot: string): string[] {
  const names = exampleModelNames();

  if (names.size === 0) {
    return [];
  }

  const schemaFile = path.join(destRoot, 'prisma', 'schema.prisma');
  const { schema, removed } = stripModelsFromSchema(
    readFileSync(schemaFile, 'utf8'),
    names,
  );
  writeFileSync(schemaFile, schema);

  const gone = new Set(removed);

  for (const { file, set: setName } of MODEL_REGISTRIES.filter(
    (registry) => registry.stripped,
  )) {
    const target = path.join(destRoot, file);
    writeFileSync(
      target,
      withoutSetEntries(readFileSync(target, 'utf8'), setName, gone),
    );
  }

  return removed;
}

/**
 * The copied CI would fail on its first run for two reasons that are both
 * artefacts of the copy: `--frozen-lockfile` against a project whose lockfile
 * is generated by its own first install, and `migrate deploy` against a project
 * whose migrations do not exist until it runs the command the README gives it.
 * `hery migrate` is that command, and it also emits the row-level policies.
 */
function rewriteWorkflows(destRoot: string): void {
  const docsWorkflow = path.join(destRoot, '.github/workflows/docs.yml');

  if (existsSync(docsWorkflow)) {
    rmSync(docsWorkflow);
  }

  const file = path.join(destRoot, '.github/workflows/ci.yml');

  if (!existsSync(file)) {
    return;
  }

  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replace(
        'pnpm install --frozen-lockfile',
        'pnpm install --no-frozen-lockfile',
      )
      .replace(
        'pnpm exec prisma migrate deploy',
        'pnpm hery migrate --name ci',
      ),
  );
}

/**
 * Everything in this repository's manifest that names *this* project rather
 * than describing a HeryJs application. Copied over, they would make every
 * generated project claim HeryJs's repository, its issue tracker, its author
 * and its release number -- and `npm publish` in that project would offer all
 * of it to the registry.
 */
const FRAMEWORK_FIELDS = [
  'author',
  'bin',
  'bugs',
  'files',
  'homepage',
  'keywords',
  'license',
  'repository',
] as const;

export interface ProjectManifest {
  name: string;
  version: string;
  description: string;
  scripts: Record<string, string>;
  jest: { roots: string[] };
}

/**
 * The generated project's own manifest, from this repository's. Exported for
 * the spec: the fields it drops are the ones nobody notices until a project
 * publishes them.
 */
export function projectManifest(
  source: Record<string, unknown>,
  projectName: string,
): ProjectManifest {
  // Cloned rather than spread: a shallow copy shares `scripts` and `jest` with
  // the manifest it was read from, so every edit below reached back into it.
  const manifest = structuredClone(source) as unknown as ProjectManifest &
    Record<string, unknown>;

  FRAMEWORK_FIELDS.forEach((field) => delete manifest[field]);

  manifest.name = projectName;
  manifest.description = 'A HeryJs project.';

  // Its own first release, not the kernel's. The kernel version a project was
  // generated from lives in cli/lib/kernel-version.ts, which travels with it.
  manifest.version = '0.0.1';

  // A project regenerates its Prisma client on every install. The framework
  // cannot: shipped as a lifecycle script, `prisma generate` runs inside
  // whoever installs the published package, where prisma is not resolvable --
  // it failed the install outright, before the scaffolder was ever reached.
  manifest.scripts.postinstall = 'prisma generate';

  CHECKS_THIS_REPOSITORY_OWNS.forEach(({ script }) => {
    delete manifest.scripts[script];
  });

  manifest.jest.roots = ['<rootDir>/src'];

  // No admin/ workspace and no examples/ directory until the dev installs
  // admin-astro or generates a resource — both otherwise-absent things this
  // repository's own lint script assumes. The ignore-pattern stays: the
  // admin-astro package's own eslint.config.mjs still ships in packages/ and
  // still shadows the root config for its neighbors the same way it does here.
  manifest.scripts.lint =
    'eslint "{src,apps,libs,test,cli,scripts,prisma,packages}/**/*.ts" "prisma.config.ts" "hery.config.ts" "cors.config.ts" --ignore-pattern "packages/admin-astro/src/runtime/**" --fix';

  return manifest;
}

function rewritePackageJson(destRoot: string, projectName: string): void {
  const file = path.join(destRoot, 'package.json');
  const source = JSON.parse(readFileSync(file, 'utf8')) as Record<
    string,
    unknown
  >;

  writeFileSync(
    file,
    `${JSON.stringify(projectManifest(source, projectName), null, 2)}\n`,
  );
}

/**
 * 'admin' and 'docs' are this repository's own workspace members. Neither
 * ships: the admin is opt-in (`hery install admin-astro` adds it back to this
 * same file), and the doc site is specific to the framework itself.
 */
function rewriteWorkspaceFile(destRoot: string): void {
  const file = path.join(destRoot, 'pnpm-workspace.yaml');
  const source = readFileSync(file, 'utf8');

  writeFileSync(
    file,
    source.replace("  - 'admin'\n", '').replace("  - 'docs'\n", ''),
  );
}

function writeReadme(destRoot: string, projectName: string): void {
  writeFileSync(
    path.join(destRoot, 'README.md'),
    `# ${projectName}

A project built with [HeryJs](https://github.com/techmefr/HeryJs).

## Getting started

\`\`\`bash
cp .env.example .env
pnpm install
pnpm hery up --start
pnpm hery migrate --name init
pnpm start:dev
\`\`\`

\`hery up --start\` brings the compose services up and writes the ports Docker
actually assigned back into \`.env\`. They are not fixed: the compose file
publishes on an ephemeral port so several projects can run side by side, and
\`docker compose up -d\` alone leaves \`.env\` pointing at a port nothing listens
on.

\`hery migrate\` wraps \`prisma migrate dev\` and adds the row-level security
policy for every tenant-scoped table, so the database boundary is created with
the tables rather than remembered afterwards.

## Adding a resource

\`\`\`bash
pnpm hery create:blueprint <Name>
pnpm hery generate blueprints/<name>.yaml
\`\`\`

The blueprint is only read once, at generation time. From then on the generated files are yours to edit like any other NestJS code — nothing re-syncs.

## Adding a module

\`\`\`bash
pnpm hery module:list
pnpm hery install <module>
\`\`\`
`,
  );
}

/**
 * Written from a template instead of copied, because npm strips a file named
 * `.gitignore` out of the tarball: carried under that name, a published
 * package would scaffold a project with none, and the copy loop used to skip
 * it without a word. The framework's own `.gitignore` is a different file with
 * a different job, and the two are free to diverge.
 */
function writeGitignore(destRoot: string): void {
  writeFileSync(
    path.join(destRoot, '.gitignore'),
    readFileSync(
      path.join(REPO_ROOT, 'templates', 'project.gitignore'),
      'utf8',
    ),
  );
}

/**
 * Every entry is part of the payload, so a missing one is a broken payload,
 * not a variation to absorb. Skipped quietly, it produced a project missing a
 * file nobody would look for until something else failed because of it.
 */
function copyInto(destRoot: string): void {
  for (const entry of COPY_ENTRIES) {
    const source = path.join(REPO_ROOT, entry);

    if (!existsSync(source)) {
      throw new Error(
        `${REPO_ROOT} is not a complete HeryJs payload: it has no ${entry}.`,
      );
    }

    const destination = path.join(destRoot, entry);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
  }
}

export function registerNewCommand(program: Command): void {
  program
    .command('new <name>')
    .description('Scaffold a new HeryJs project in its own directory')
    .action((name: string) => {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        console.error(
          pc.red(
            `"${name}" is not a valid project name — use lowercase letters, digits, and hyphens only.`,
          ),
        );
        process.exitCode = 1;
        return;
      }

      const destRoot = path.resolve(process.cwd(), name);

      if (existsSync(destRoot)) {
        console.error(pc.red(`${destRoot} already exists.`));
        process.exitCode = 1;
        return;
      }

      mkdirSync(destRoot, { recursive: true });
      copyInto(destRoot);
      dropChecksThisRepositoryOwns(destRoot);
      dropSpecsThatNeedTheExample(destRoot);
      const removedModels = dropExampleModels(destRoot);
      const droppedSpecs = dropSpecsNamingRemovedModels(
        destRoot,
        removedModels,
      );
      rewriteWorkflows(destRoot);
      rewritePackageJson(destRoot, name);
      rewriteWorkspaceFile(destRoot);
      writeReadme(destRoot, name);
      writeGitignore(destRoot);

      spawnSync('git', ['init'], { cwd: destRoot, stdio: 'ignore' });
      spawnSync('git', ['add', '-A'], { cwd: destRoot, stdio: 'ignore' });
      spawnSync(
        'git',
        ['commit', '-m', 'Scaffold a new HeryJs project', '--quiet'],
        { cwd: destRoot, stdio: 'ignore' },
      );

      console.log(pc.green(`✔ Created ${destRoot}`));

      if (removedModels.length > 0) {
        console.log(
          pc.dim(
            `  the framework's own demo stayed behind: ${removedModels.join(', ')}`,
          ),
        );
        console.log(
          pc.dim(
            `  with the ${droppedSpecs} kernel specs written against it — this repository proves the kernel, your project proves your resources`,
          ),
        );
      }

      console.log('');
      console.log(pc.cyan('Next steps:'));
      console.log(`  cd ${name}`);
      console.log(`  cp .env.example .env`);
      console.log(`  pnpm install`);
      console.log(`  pnpm hery up --start`);
      console.log(`  pnpm hery migrate --name init`);
      console.log(`  pnpm start:dev`);
    });
}
