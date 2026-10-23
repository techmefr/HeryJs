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
import { APP_MODULE, unwireModule } from '../lib/app-module-patch';
import {
  modulePackageName,
  unwireDeclaredModule,
} from '../lib/hery-config-patch';
import { loadBlueprint } from '../lib/blueprint';
import {
  withProjectConventionScripts,
  withProjectConventionStep,
} from '../lib/convention-scripts';
import { frameworkRoot } from '../lib/framework-root';
import {
  applyKernelPackageRewrites,
  kernelDependency,
  kernelIsBuilt,
} from '../lib/kernel-dependency';
import { KERNEL_PACKAGE, KERNEL_PACKAGE_DIR } from '../lib/kernel-public-api';
import { pascalCase } from '../lib/naming';
import { bareName, runtimeImports } from '../lib/runtime-imports';
import { stripModelsFromSchemaFolder } from '../lib/strip-example';

export { withoutKernelDependency } from '../lib/kernel-dependency';

const REPO_ROOT = frameworkRoot();

/**
 * Everything a fresh project needs to run `hery generate`/`hery install` on
 * its own: the CLI itself, every module's authoring package, the test support
 * of devtools/ (it boots the project's own AppModule), the modules this
 * repository has installed (modules/, trimmed by dropOptionalModules to the
 * ones the kernel needs), and the config each of those depends on. The kernel
 * itself is not copied: src/technical and the rest of src/devtools are the
 * `@heryjs/core` package, which the project installs. Deliberately excluded
 * as well: examples/ and docs/ (this framework's own demo and doc site, not
 * part of what ships), admin/ (installed later via `hery install admin-astro`,
 * same as any other opt-in module), and anything that is this repository's
 * own build/dev state (node_modules, dist, the lockfile, .git, .env).
 */
export const COPY_ENTRIES = [
  'cli',
  'packages',
  'scripts/postgres',
  'src/devtools/testing',
  'src/devtools/test-support.ts',
  'src/modules',
  'src/functional',
  'src/app.controller.ts',
  'src/app.controller.spec.ts',
  'src/app.module.ts',
  'src/hery.modules.ts',
  'src/app.service.ts',
  'src/create-app.ts',
  'src/main.ts',
  'test',
  '.github',
  'prisma/schema',
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

  return stripModelsFromSchemaFolder(destRoot, names);
}

/**
 * The modules a fresh project keeps out of those this repository has
 * installed, each with the reason it cannot be left for `hery install`: its
 * install wrote into kernel files, or the kernel reads its table, so taking it
 * out would mean reverting the kernel rather than deleting a directory. Every
 * other module is removed and installed on demand.
 */
export const MODULES_THE_KERNEL_NEEDS: Record<string, string> = {
  impersonation:
    'the kernel reads the role and impersonatedBy columns its install adds to User and Session',
  'two-factor': 'its install adds relations to User',
  push: 'src/technical/auth/guest-upgrade.ts moves the PushToken rows of a guest',
};

const PROJECT_SOURCE_DIRS = ['src', 'cli', 'scripts', 'test', 'prisma'];

function typescriptFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return typescriptFilesUnder(full);
    }

    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function packagesImportedUnder(dirs: string[]): Set<string> {
  return new Set(
    dirs
      .flatMap(typescriptFilesUnder)
      .flatMap((file) => runtimeImports(readFileSync(file, 'utf8'), true)),
  );
}

/**
 * The kernel-side files a module brings: its directory under src/modules, its
 * Prisma models, its hery.config.ts entry, the compose file its install copies, the
 * root dependencies nothing else imports, and any kernel spec written against
 * it. All of it comes back with `hery install <name>`.
 */
function dropOptionalModules(destRoot: string): string[] {
  const modulesDir = path.join(destRoot, 'src', 'modules');
  const removable = readdirSync(modulesDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !(entry.name in MODULES_THE_KERNEL_NEEDS) &&
        existsSync(path.join(destRoot, 'packages', entry.name, 'src')),
    )
    .map((entry) => entry.name);

  if (removable.length === 0) {
    return [];
  }

  const removedDirs = removable.map((name) => path.join(modulesDir, name));
  const installedByRemoved = new Set<string>();
  const models = new Set<string>();
  const appModuleFile = path.join(destRoot, APP_MODULE);
  let appModule = readFileSync(appModuleFile, 'utf8');

  for (const name of removable) {
    const definition = readFileSync(
      path.join(destRoot, 'packages', name, 'src', 'module.ts'),
      'utf8',
    );

    for (const match of definition.matchAll(/^model (\w+) \{/gm)) {
      models.add(match[1]!);
    }

    const dependencies = /^ {2}dependencies: \[([^\]]*)\]/m.exec(definition);

    for (const spec of dependencies?.[1]?.matchAll(/'([^']+)'/g) ?? []) {
      installedByRemoved.add(bareName(spec[1]!));
    }

    appModule = unwireModule(appModule, name)?.source ?? appModule;
    unwireDeclaredModule(destRoot, {
      name: modulePackageName(path.join(destRoot, 'packages', name), name),
      moduleName: name,
      dest: path.join('src', 'modules', name),
    });

    const packageDir = path.join(destRoot, 'packages', name);

    for (const file of readdirSync(packageDir)) {
      if (/^docker-compose\..+\.ya?ml$/.test(file)) {
        rmSync(path.join(destRoot, file), { force: true });
      }
    }
  }

  writeFileSync(appModuleFile, appModule);
  removedDirs.forEach((dir) => rmSync(dir, { recursive: true }));

  stripModelsFromSchemaFolder(destRoot, models);

  const specifiers = new RegExp(
    removable.map((name) => `'#modules/${name}/`).join('|'),
  );
  specFilesUnder(path.join(destRoot, 'src'))
    .filter((file) => specifiers.test(readFileSync(file, 'utf8')))
    .forEach((file) => rmSync(file));

  const stillImported = packagesImportedUnder(
    PROJECT_SOURCE_DIRS.map((dir) => path.join(destRoot, dir)),
  );
  const manifestFile = path.join(destRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
    dependencies: Record<string, string>;
  };

  for (const name of installedByRemoved) {
    if (!stillImported.has(name)) {
      delete manifest.dependencies[name];
    }
  }

  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  return removable;
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
    withProjectConventionStep(
      readFileSync(file, 'utf8')
        .replace(
          'pnpm install --frozen-lockfile',
          'pnpm install --no-frozen-lockfile',
        )
        .replace(
          'pnpm exec prisma migrate deploy',
          'pnpm hery migrate --name ci',
        )
        .replace(DOC_EXAMPLES_STEP, ''),
    ),
  );
}

export const DOC_EXAMPLES_STEP = `      - name: Check the generated endpoint examples are fresh
        if: \${{ !cancelled() }}
        run: |
          pnpm run docs:examples
          git diff --exit-code docs/src/data/endpoint-examples.generated.ts

`;

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
  private: boolean;
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

  // Declared rather than inherited: the framework's own manifest is published,
  // so this stopped travelling the moment it was. An application is not a
  // package, and a project that publishes itself by accident publishes its
  // whole source.
  manifest.private = true;

  // A project regenerates its Prisma client on every install. The framework
  // cannot: shipped as a lifecycle script, `prisma generate` runs inside
  // whoever installs the published package, where prisma is not resolvable --
  // it failed the install outright, before the scaffolder was ever reached.
  manifest.scripts.postinstall = 'prisma generate';

  manifest.scripts = withProjectConventionScripts(manifest.scripts);

  manifest.jest.roots = ['<rootDir>/src'];

  // No admin/ workspace and no examples/ directory until the dev installs
  // admin-astro or generates a resource — both otherwise-absent things this
  // repository's own lint script assumes. The ignore-pattern stays: the
  // admin-astro package's own eslint.config.mjs still ships in packages/ and
  // still shadows the root config for its neighbors the same way it does here.
  manifest.scripts.lint =
    'eslint "{src,apps,libs,test,cli,scripts,prisma,packages}/**/*.ts" "prisma.config.ts" "hery.config.ts" "cors.config.ts" --ignore-pattern "packages/admin-astro/src/runtime/**" --max-warnings 0';
  manifest.scripts['lint:fix'] = `${manifest.scripts.lint} --fix`;

  // The endpoint examples are this repository's documentation, captured from
  // examples/blog-post, which a project does not have.
  delete manifest.scripts['docs:examples'];

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

## Deploying

\`Dockerfile\` builds the production image and a one-shot migration job from
the same source. The environment contract and the rollout order are in the
[deployment guide](https://techmefr.github.io/HeryJs/guides/deployment/).

\`\`\`bash
docker build --target migrate -t ${projectName}-migrate .
docker build -t ${projectName} .
\`\`\`

## Adding a resource

\`\`\`bash
pnpm hery create:blueprint <Name>
pnpm hery generate blueprints/<name>.yaml
\`\`\`

The blueprint is only read once, at generation time. From then on the generated files are yours to edit like any other NestJS code — nothing re-syncs.

## The kernel

The kernel is the \`@heryjs/core\` package, not a folder of this project. Until
it is published, \`package.json\` installs the one a local HeryJs checkout
builds, with a \`file:\` path. To move to the registry, change that one line to
a version range and install again:

\`\`\`json
"@heryjs/core": "^0.1.0"
\`\`\`

\`src/devtools/testing\` and \`src/devtools/test-support.ts\` stay here: they
boot this project's own AppModule.

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
 * The production image, written from templates for the same reason as the
 * gitignore: `.dockerignore` is the name Docker reads, and a template keeps the
 * framework's own repository free of an image it never builds.
 */
function writeContainerFiles(destRoot: string): void {
  const templates = path.join(REPO_ROOT, 'templates');

  writeFileSync(
    path.join(destRoot, 'Dockerfile'),
    readFileSync(path.join(templates, 'Dockerfile'), 'utf8'),
  );
  writeFileSync(
    path.join(destRoot, '.dockerignore'),
    readFileSync(path.join(templates, 'dockerignore'), 'utf8'),
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
    cpSync(source, destination, { recursive: true, verbatimSymlinks: true });
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

      if (!kernelIsBuilt(REPO_ROOT)) {
        console.error(
          pc.red(
            `${KERNEL_PACKAGE} is not built in ${REPO_ROOT}: run "pnpm run build:core" there first, the project installs it from there.`,
          ),
        );
        process.exitCode = 1;
        return;
      }

      mkdirSync(destRoot, { recursive: true });
      copyInto(destRoot);
      rmSync(path.join(destRoot, KERNEL_PACKAGE_DIR), { recursive: true });
      const removedModels = dropExampleModels(destRoot);
      const droppedSpecs = dropSpecsNamingRemovedModels(
        destRoot,
        removedModels,
      );
      rewriteWorkflows(destRoot);
      rewritePackageJson(destRoot, name);
      const removedModules = dropOptionalModules(destRoot);
      rewriteWorkspaceFile(destRoot);
      writeReadme(destRoot, name);
      writeGitignore(destRoot);
      writeContainerFiles(destRoot);
      applyKernelPackageRewrites(destRoot, kernelDependency(REPO_ROOT), {
        write: true,
      });

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

      if (removedModules.length > 0) {
        console.log(
          pc.dim(
            `  left out for "pnpm hery install <module>" when you need them: ${removedModules.join(', ')}`,
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
